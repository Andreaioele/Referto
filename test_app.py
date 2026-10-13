import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import benchmarking
import decision_model
import glossario_medico
import strutture_sanitarie
import farmaci_referti
import profilo_utente
import web_app
from spiega_referto import (
    dataset_record_to_text,
    detokenize_report,
    extract_document_recommendations,
    load_jsonl_reports,
    normalize_explanation_format,
    sanitize_explanation,
    validate_explanation,
)


class ParserTests(unittest.TestCase):
    def test_detokenize_radgraph(self):
        tokens = ["L", "'", "esame", "e", "nella", "norma", ".", "TC", "addome", "/", "pelvi"]
        self.assertEqual(detokenize_report(tokens), "L'esame e nella norma. TC addome/pelvi")

    def test_radgraph_record(self):
        record = {"sentences": [["REFERTO", ":", "Nessun", "versamento", "."]]}
        self.assertEqual(dataset_record_to_text(record), "REFERTO: Nessun versamento.")

    def test_jsonl_limit(self):
        with tempfile.TemporaryDirectory() as temp_name:
            path = Path(temp_name) / "reports.jsonl"
            path.write_text(
                "\n".join(json.dumps({"text": f"Referto completo numero {i}."}) for i in range(3)),
                encoding="utf-8",
            )
            self.assertEqual(len(load_jsonl_reports(path, limit=2)), 2)

    def test_safety_sanitizer(self):
        output = """1. SINTESI
- Il cuore sembra normale.
- Possibile opacita' basale.

2. SPIEGAZIONE IN PAROLE SEMPLICI
- Non ci sono segni di polmonite.
- E' descritta un'area più scura.

3. INCERTEZZE O LIMITI DEL REFERTO
- Non sono riportati limiti specifici."""
        cleaned = sanitize_explanation(
            output,
            "Possibile opacita' basale. L'angolo costo-frenico e' escluso in questa immagine.",
        )
        self.assertNotIn("cuore sembra normale", cleaned)
        self.assertNotIn("polmonite", cleaned)
        self.assertIn("piu' opaca", cleaned.lower())
        self.assertIn("angolo costo-frenico", cleaned.lower())

    def test_plain_text_formatter(self):
        formatted = normalize_explanation_format("""**1. SINTESI**
* Primo fatto importante.
* Secondo fatto importante.

2. SPIEGAZIONE IN PAROLE SEMPLICI
- Il termine viene spiegato.

3. INCERTEZZE O LIMITI DEL REFERTO
• Non sono riportati limiti specifici.""")
        self.assertNotIn("*", formatted)
        self.assertNotRegex(formatted, r"(?m)^\s*(?:[-•]|\d+[.)])\s+")
        self.assertIn("Primo fatto importante. Secondo fatto importante.", formatted)
        self.assertEqual(formatted.count("SINTESI"), 1)
        self.assertIn("INDICAZIONI RIPORTATE NEL DOCUMENTO", formatted)

    def test_sanitizer_keeps_valid_sentences_in_same_paragraph(self):
        cleaned = sanitize_explanation(
            "SINTESI\nPossibile opacita' basale. Il cuore sembra normale. "
            "Si vede una leggera area più scura. Potrebbe essere un'infezione. "
            "L'esame e' limitato dalla scarsa inspirazione.",
            "Possibile opacita' basale. Esame limitato dalla scarsa inspirazione.",
        )
        self.assertIn("Possibile opacita' basale", cleaned)
        self.assertIn("piu' opaca", cleaned)
        self.assertIn("scarsa inspirazione", cleaned)
        self.assertNotIn("cuore sembra normale", cleaned)
        self.assertNotIn("infezione", cleaned)

    def test_document_advice_is_attributed_and_does_not_fail_validation(self):
        report = (
            "Lieve arrossamento della lingua.\n\n"
            "Utile alimentazione corretta e l'eventuale utilizzo di enzimi digestivi.\n\n"
            "Enzylformula: una compressa dopo pranzo e cena."
        )
        model_output = """SINTESI
Lieve arrossamento della lingua. Si consiglia di assumere enzimi digestivi.

SPIEGAZIONE IN PAROLE SEMPLICI
La lingua è leggermente arrossata.

INCERTEZZE O LIMITI DEL REFERTO
Non sono riportati limiti specifici.

INDICAZIONI RIPORTATE NEL DOCUMENTO
Si consiglia di assumere enzimi digestivi."""
        cleaned = normalize_explanation_format(
            sanitize_explanation(model_output, report)
        )
        self.assertIn("Il documento riporta queste indicazioni", cleaned)
        self.assertIn("una compressa dopo pranzo e cena", cleaned)
        self.assertEqual(validate_explanation(cleaned), [])
        self.assertEqual(len(extract_document_recommendations(report)), 2)


class DecisionModelTests(unittest.TestCase):
    def test_fast_route_can_skip_audit(self):
        payload = {
            "answers": {
                "route": {
                    "choice": "fast",
                    "probabilities": {"fast": 0.94, "standard": 0.04, "guarded": 0.02},
                    "confidence": 0.8,
                },
                "release": {
                    "choice": "safe_to_publish",
                    "probabilities": {"needs_review": 0.03, "safe_to_publish": 0.97},
                },
            },
            "usage": {"input_tokens": 100, "output_tokens": 0},
        }

        class FakeResponse:
            def __enter__(self):
                return io.BytesIO(json.dumps(payload).encode())

            def __exit__(self, *_args):
                return False

        with patch("decision_model.urllib.request.urlopen", return_value=FakeResponse()):
            result = decision_model.decide_audit(
                "Referto sufficientemente lungo.", "SINTESI\nNessun reperto rilevante.", "http://localhost"
            )
        self.assertTrue(result.should_skip_audit)
        self.assertEqual(result.route, "fast")

    def test_failure_falls_back_to_full_audit(self):
        with patch("decision_model.urllib.request.urlopen", side_effect=TimeoutError("timeout")):
            result = decision_model.decide_audit("referto", "bozza", "http://localhost")
        self.assertFalse(result.should_skip_audit)
        self.assertEqual(result.route, "standard")
        self.assertIn("TimeoutError", result.fallback_reason)

    def test_compact_state_budget_prevents_context_overflow(self):
        huge_report = "parola " * 2000
        huge_draft = "spiegazione " * 2000
        state = decision_model._compact_state(huge_report, huge_draft)
        self.assertLessEqual(len(state), 2300)

    def test_http_error_body_is_captured_in_fallback_reason(self):
        error_file = io.BytesIO(b'{"error": "state has 995 tokens"}')
        http_error = urllib.error.HTTPError(
            url="http://localhost",
            code=400,
            msg="Bad Request",
            hdrs={},
            fp=error_file,
        )
        with patch("decision_model.urllib.request.urlopen", side_effect=http_error):
            result = decision_model.decide_systemone_audit("referto", "bozza", "http://localhost")
        self.assertFalse(result.should_skip_audit)
        self.assertIn("HTTPError 400", result.fallback_reason)
        self.assertIn("state has 995 tokens", result.fallback_reason)

    def test_is_embedding_model_recognition(self):
        self.assertTrue(decision_model.is_embedding_model("bge-m3:latest"))
        self.assertTrue(decision_model.is_embedding_model("nomic-embed-text"))
        self.assertFalse(decision_model.is_embedding_model("laya:322m-multilingual-mlx-fp16"))
        self.assertFalse(decision_model.is_embedding_model("medgemma:4b-it-q4_K_M"))

    def test_embedding_model_grounding_skips_audit_when_supported(self):
        class FakeEmbedResponse:
            def __enter__(self):
                # 2 report sentences, 2 draft claim sentences: perfect match
                embs = [
                    [1.0, 0.0], [0.0, 1.0],  # report
                    [0.99, 0.01], [0.01, 0.99],  # draft claims
                ]
                return io.BytesIO(json.dumps({"embeddings": embs}).encode())

            def __exit__(self, *_args):
                return False

        with patch("decision_model.urllib.request.urlopen", return_value=FakeEmbedResponse()):
            result = decision_model.decide_audit(
                report="Cuore nella norma. Polmoni privi di lesioni.",
                draft="SINTESI\nLe dimensioni cardiache sono normali. Il parenchima polmonare e' integro.",
                base_url="http://localhost",
                model="bge-m3:latest",
            )
        self.assertTrue(result.should_skip_audit)
        self.assertEqual(result.route, "fast")
        self.assertGreater(result.route_probability, 0.8)

    def test_embedding_model_grounding_enforces_audit_when_unsupported(self):
        class FakeEmbedResponse:
            def __enter__(self):
                # Report has vector [1, 0], draft has orthogonal hallucination [0, 1] (sim = 0)
                embs = [
                    [1.0, 0.0],  # report
                    [0.0, 1.0],  # draft hallucination
                ]
                return io.BytesIO(json.dumps({"embeddings": embs}).encode())

            def __exit__(self, *_args):
                return False

        with patch("decision_model.urllib.request.urlopen", return_value=FakeEmbedResponse()):
            result = decision_model.decide_audit(
                report="Nessuna anomalia polmonare evidente.",
                draft="SINTESI\nEvidente presenza di grave frattura e polmonite acuta.",
                base_url="http://localhost",
                model="bge-m3:latest",
            )
        self.assertFalse(result.should_skip_audit)
        self.assertEqual(result.route, "standard")



class BenchmarkTests(unittest.TestCase):
    def test_dataset_benchmark_aggregates_every_report_without_saving_text(self):
        records = [
            ({"dataset": "test", "doc_key": "a"}, "Primo referto segreto abbastanza lungo."),
            ({"dataset": "test", "doc_key": "b"}, "Secondo referto segreto abbastanza lungo."),
        ]
        progress = []

        def fake_run(_report, mode, repeat, order, *_args):
            decision = mode == "decision"
            return {
                "mode": mode, "repeat": repeat, "order": order,
                "duration_ms": 50 if decision else 100, "success": True,
                "error": None, "validation_issues": [], "model_calls": 1,
                "medgemma_calls": 1 if decision else 2, "decision_calls": int(decision),
                "prompt_tokens": 10, "generated_tokens": 5, "ollama_duration_ms": 40,
                "audit_called": not decision, "repair_called": False,
                "audit_skipped": decision, "decision_route": "fast" if decision else None,
                "decision_probability": 0.99 if decision else None,
                "audit_probability": 0.01 if decision else None,
            }

        with tempfile.TemporaryDirectory() as temp_name, patch(
            "benchmarking._run_once", side_effect=fake_run
        ):
            result = benchmarking.run_dataset_benchmark(
                records=records,
                source_name="sample.jsonl",
                output_dir=Path(temp_name),
                base_url="http://localhost",
                model="model",
                timeout=1,
                max_chars=1000,
                repeats=1,
                progress_callback=progress.append,
            )
            saved = (Path(temp_name) / f"{result['id']}.json").read_text(encoding="utf-8")

        self.assertEqual(result["kind"], "dataset")
        self.assertEqual(result["dataset"]["records"], 2)
        self.assertEqual(result["configuration"]["total_executions"], 4)
        self.assertEqual(result["comparison"]["reports_faster"], 2)
        self.assertEqual(progress[-1]["completed_executions"], 4)
        self.assertNotIn("Primo referto segreto", saved)
        self.assertNotIn("Secondo referto segreto", saved)


class WebTests(unittest.TestCase):
    def setUp(self):
        self.trace_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.trace_directory.cleanup)
        self.benchmark_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.benchmark_directory.cleanup)
        web_app.app.config.update(
            TESTING=True,
            TRACE_DIR=Path(self.trace_directory.name),
            BENCHMARK_DIR=Path(self.benchmark_directory.name),
        )
        self.client = web_app.app.test_client()

    def test_home(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"<title>Referto</title>", response.data)
        self.assertNotIn(b"Referto Chiaro", response.data)
        self.assertIn("Cronologia".encode(), response.data)
        self.assertIn("Performance".encode(), response.data)

    @patch("web_app._explain_text", return_value="SPIEGAZIONE TEST")
    def test_text_endpoint(self, _mock):
        response = self.client.post(
            "/api/analyze/text",
            data={"text": "Questo e un referto sufficientemente lungo per il test automatico."},
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["result"], "SPIEGAZIONE TEST")
        trace_response = self.client.get(f"/api/traces/{data['trace_id']}")
        trace = trace_response.get_json()["trace"]
        self.assertEqual(trace["status"], "ok")
        self.assertEqual(trace["source_type"], "text")
        self.assertEqual(trace["output"], "SPIEGAZIONE TEST")

    def test_failed_execution_is_traced(self):
        response = self.client.post("/api/analyze/text", data={"text": "Troppo breve"})
        self.assertEqual(response.status_code, 400)
        trace_id = response.get_json()["trace_id"]
        trace = self.client.get(f"/api/traces/{trace_id}").get_json()["trace"]
        self.assertEqual(trace["status"], "error")
        self.assertIn("troppo breve", trace["error"])

    @patch("web_app.explain_report", return_value="SPIEGAZIONE DATASET")
    def test_dataset_endpoint(self, _mock):
        payload = b'{"dataset":"test","doc_key":1,"sentences":[["REFERTO",":","Nella","norma","."]]}\n'

        class ImmediateThread:
            def __init__(self, target, args, **_kwargs):
                self.target = target
                self.args = args

            def start(self):
                self.target(*self.args)

        with tempfile.TemporaryDirectory() as temp_name:
            with patch.object(web_app, "RESULTS_DIR", Path(temp_name)):
                with patch("web_app.threading.Thread", ImmediateThread):
                    response = self.client.post(
                        "/api/analyze/dataset",
                        data={
                            "limit": "1",
                            "dataset": (io.BytesIO(payload), "sample.jsonl"),
                        },
                        content_type="multipart/form-data",
                    )
                    self.assertEqual(response.status_code, 202)
                    job = response.get_json()["job"]
                    self.assertEqual(job["status"], "complete")
                    self.assertEqual(job["records_total"], 1)
                    self.assertIn("aggregates", job["result"])
                    self.assertIn("items", job["result"])
                    self.assertEqual(len(job["result"]["items"]), 1)
                    item = job["result"]["items"][0]
                    self.assertIn("duration_ms", item)
                    self.assertIn("medgemma_calls", item)

    @patch("web_app.run_paired_benchmark")
    def test_benchmark_endpoint(self, run_mock):
        run_mock.return_value = {
            "id": "benchmark-test",
            "aggregates": {"baseline": {}, "decision": {}},
            "comparison": {"speedup_percent": 25.0},
        }
        response = self.client.post(
            "/api/benchmark",
            data={
                "text": "Questo e un referto abbastanza lungo per eseguire un confronto automatico.",
                "repeats": "2",
            },
        )
        self.assertEqual(response.status_code, 200)
        response_data = response.get_json()
        self.assertEqual(response_data["benchmark"]["id"], "benchmark-test")
        self.assertEqual(run_mock.call_args.kwargs["repeats"], 2)
        trace = self.client.get(
            f"/api/traces/{response_data['trace_id']}"
        ).get_json()["trace"]
        self.assertEqual(trace["status"], "ok")
        self.assertEqual(trace["source_type"], "benchmark")

    @patch("web_app.run_dataset_benchmark")
    def test_dataset_benchmark_runs_as_job(self, run_mock):
        run_mock.return_value = {
            "id": "benchmark-dataset-test",
            "kind": "dataset",
            "dataset": {"records": 2},
            "configuration": {"repeats": 1, "total_executions": 4},
            "aggregates": {"baseline": {}, "decision": {}},
            "comparison": {"speedup_percent": 20.0},
        }
        payload = (
            b'{"doc_key":"a","text":"Primo referto abbastanza lungo per il test."}\n'
            b'{"doc_key":"b","text":"Secondo referto abbastanza lungo per il test."}\n'
        )

        class ImmediateThread:
            def __init__(self, target, args, **_kwargs):
                self.target = target
                self.args = args

            def start(self):
                self.target(*self.args)

        with patch("web_app.threading.Thread", ImmediateThread):
            response = self.client.post(
                "/api/benchmark/dataset",
                data={
                    "repeats": "1",
                    "dataset": (io.BytesIO(payload), "sample.jsonl"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 202)
        job = response.get_json()["job"]
        self.assertEqual(job["status"], "complete")
        self.assertEqual(job["records_total"], 2)
        detail = self.client.get(f"/api/benchmark/jobs/{job['id']}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.get_json()["job"]["benchmark"]["kind"], "dataset")
        self.assertEqual(run_mock.call_args.kwargs["repeats"], 1)

    @patch("web_app.run_dataset_benchmark")
    def test_dataset_benchmark_with_random_sampling_and_decision_mode(self, run_mock):
        run_mock.return_value = {
            "id": "benchmark-dataset-sample-test",
            "kind": "dataset",
            "dataset": {"records": 2, "sampled": True, "total_available": 4},
            "configuration": {"repeats": 1, "test_mode": "decision", "total_executions": 2},
            "aggregates": {"baseline": {}, "decision": {}},
            "comparison": {"speedup_percent": 0.0},
        }
        payload = (
            b'{"doc_key":"1","text":"Referto uno abbastanza lungo per il test di campionamento."}\n'
            b'{"doc_key":"2","text":"Referto due abbastanza lungo per il test di campionamento."}\n'
            b'{"doc_key":"3","text":"Referto tre abbastanza lungo per il test di campionamento."}\n'
            b'{"doc_key":"4","text":"Referto quattro abbastanza lungo per il test di campionamento."}\n'
        )

        class ImmediateThread:
            def __init__(self, target, args, **_kwargs):
                self.target = target
                self.args = args

            def start(self):
                self.target(*self.args)

        with patch("web_app.threading.Thread", ImmediateThread):
            response = self.client.post(
                "/api/benchmark/dataset",
                data={
                    "repeats": "1",
                    "sample_size": "2",
                    "test_mode": "decision",
                    "dataset": (io.BytesIO(payload), "sample.jsonl"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 202)
        job = response.get_json()["job"]
        self.assertEqual(job["status"], "complete")
        self.assertEqual(job["records_total"], 2)
        self.assertEqual(job["total_executions"], 2)  # 2 records * 1 repeat * 1 mode
        self.assertEqual(job["test_mode"], "decision")
        self.assertTrue(job["sample_info"]["sampled"])
        self.assertEqual(job["sample_info"]["sample_size"], 2)
        self.assertEqual(job["sample_info"]["total_available"], 4)
        self.assertEqual(run_mock.call_args.kwargs["test_mode"], "decision")
        self.assertTrue(run_mock.call_args.kwargs["sample_info"]["sampled"])

    def test_predefined_datasets_endpoint(self):
        response = self.client.get("/api/datasets/predefined")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["ok"])
        filenames = [d["filename"] for d in data["datasets"]]
        self.assertIn("radgraph_it_50.jsonl", filenames)
        self.assertIn("mtsamples_radiology.jsonl", filenames)
        self.assertIn("all_datasets_merged.jsonl", filenames)

    @patch("web_app.explain_report", return_value="SPIEGAZIONE LOCALE")
    def test_analyze_predefined_dataset(self, _mock):
        class ImmediateThread:
            def __init__(self, target, args, **_kwargs):
                self.target = target
                self.args = args

            def start(self):
                self.target(*self.args)

        with tempfile.TemporaryDirectory() as temp_name:
            with patch.object(web_app, "RESULTS_DIR", Path(temp_name)):
                with patch("web_app.threading.Thread", ImmediateThread):
                    response = self.client.post(
                        "/api/analyze/dataset",
                        data={
                            "dataset_name": "radgraph_it_50.jsonl",
                            "limit": "2",
                        },
                    )
                    self.assertEqual(response.status_code, 202)
                    job = response.get_json()["job"]
                    self.assertEqual(job["status"], "complete")
                    self.assertEqual(job["records_total"], 2)
                    self.assertEqual(len(job["result"]["items"]), 2)

    @patch("web_app.run_dataset_benchmark")
    def test_benchmark_predefined_dataset_job(self, run_mock):
        run_mock.return_value = {
            "id": "benchmark-predefined-test",
            "kind": "dataset",
            "dataset": {"records": 50},
            "configuration": {"repeats": 1, "total_executions": 100},
            "aggregates": {"baseline": {}, "decision": {}},
            "comparison": {"speedup_percent": 15.0},
        }

        class ImmediateThread:
            def __init__(self, target, args, **_kwargs):
                self.target = target
                self.args = args

            def start(self):
                self.target(*self.args)

        with patch("web_app.threading.Thread", ImmediateThread):
            response = self.client.post(
                "/api/benchmark/dataset",
                data={
                    "dataset_name": "radgraph_it_50.jsonl",
                    "repeats": "1",
                },
            )
        self.assertEqual(response.status_code, 202)
        job = response.get_json()["job"]
        self.assertEqual(job["status"], "complete")
        self.assertEqual(job["records_total"], 50)


class ClusterAgentTaskTests(unittest.TestCase):
    def test_detect_cluster_hardware(self):
        import cluster_agent_task

        hw = cluster_agent_task.detect_cluster_hardware()
        self.assertIn("hostname", hw)
        self.assertIn("cpu_count", hw)
        self.assertIn("slurm", hw)
        self.assertIn("gpus", hw)
        self.assertIn("gpu_detected", hw)
        self.assertIsInstance(hw["gpus"], list)

    def test_resolve_dataset_path(self):
        import cluster_agent_task

        # Percorso o nome standard
        p = cluster_agent_task.resolve_dataset_path("all_datasets_merged.jsonl")
        self.assertTrue(p.is_file())
        self.assertEqual(p.name, "all_datasets_merged.jsonl")

        # Senza estensione
        p2 = cluster_agent_task.resolve_dataset_path("radgraph_it_50")
        self.assertTrue(p2.is_file())
        self.assertEqual(p2.name, "radgraph_it_50.jsonl")

        # File inesistente
        with self.assertRaises(FileNotFoundError):
            cluster_agent_task.resolve_dataset_path("non_esiste_proprio_xyz.jsonl")

    def test_load_processed_keys(self):
        import cluster_agent_task

        with tempfile.TemporaryDirectory() as temp_dir:
            out_file = Path(temp_dir) / "output.jsonl"
            self.assertEqual(cluster_agent_task.load_processed_keys(out_file), set())

            out_file.write_text(
                json.dumps({"doc_key": "k1", "status": "ok"}) + "\n"
                + json.dumps({"id": "k2", "status": "ok"}) + "\n"
                + "corrupted json line\n",
                encoding="utf-8",
            )
            keys = cluster_agent_task.load_processed_keys(out_file)
            self.assertEqual(keys, {"k1", "k2"})

    def test_run_cluster_agent_task_execution_and_resume(self):
        import cluster_agent_task
        from performance_metrics import record_model_call

        valid_explanation = (
            "SINTESI\nNessun versamento pleurico o consolidamento polmonare.\n\n"
            "SPIEGAZIONE IN PAROLE SEMPLICI\nI campi polmonari sono liberi e non mostrano segni di infiammazione.\n\n"
            "INCERTEZZE O LIMITI DEL REFERTO\nNessun limite tecnico segnalato nel referto.\n\n"
            "INDICAZIONI RIPORTATE NEL DOCUMENTO\nNessuna indicazione terapeutica prescritta."
        )

        def mock_explain(*args, **kwargs):
            record_model_call({
                "kind": "decision",
                "stage": "Decision Model",
                "route": "fast",
                "should_skip_audit": True,
                "route_probability": 0.94,
            })
            record_model_call({
                "kind": "generative",
                "stage": "Bozza iniziale",
                "prompt_eval_count": 40,
                "eval_count": 80,
            })
            return valid_explanation

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            dataset_file = temp_path / "mini_dataset.jsonl"
            output_file = temp_path / "output.jsonl"
            summary_file = temp_path / "output_summary.json"
            traces_dir = temp_path / "traces"

            # 3 referti nel dataset di test
            sample_records = [
                {"doc_key": f"test-doc-{i}", "text": f"Referto torace numero {i}. Regolare."}
                for i in range(1, 4)
            ]
            dataset_file.write_text(
                "\n".join(json.dumps(r) for r in sample_records), encoding="utf-8"
            )

            # Esecuzione con limit=2
            with patch("cluster_agent_task.explain_report", side_effect=mock_explain):
                summary = cluster_agent_task.run_cluster_agent_task(
                    dataset_path=dataset_file,
                    output_path=output_file,
                    summary_path=summary_file,
                    traces_dir=traces_dir,
                    workers=2,
                    limit=2,
                    resume=False,
                    quiet=True,
                )

            self.assertEqual(summary["dataset"]["processed_in_this_run"], 2)
            self.assertEqual(summary["dataset"]["successes"], 2)
            self.assertEqual(summary["dataset"]["errors"], 0)
            self.assertEqual(summary["performance_metrics"]["audit_skipped_count"], 2)
            self.assertTrue(output_file.is_file())
            self.assertTrue(summary_file.is_file())

            # Verifica righe scritte nel file di output
            lines = [json.loads(line) for line in output_file.read_text(encoding="utf-8").splitlines() if line.strip()]
            self.assertEqual(len(lines), 2)
            self.assertEqual({l["doc_key"] for l in lines}, {"test-doc-1", "test-doc-2"})

            # Verifica file CSV generato
            csv_file = output_file.with_suffix(".csv")
            self.assertTrue(csv_file.is_file())
            import csv
            with csv_file.open("r", encoding="utf-8") as f:
                reader = list(csv.DictReader(f))
                self.assertEqual(len(reader), 2)
                row = reader[0]
                # Verifica presenza delle 4 aree richieste: performance, trace, input, output
                for col in ("duration_ms", "tokens_per_second", "trace_id", "trace_path", "report_text", "explanation"):
                    self.assertIn(col, row)
                    self.assertTrue(len(str(row[col])) > 0)

            # Esecuzione con resume=True e tutti i 3 referti: deve elaborare solo il terzo!
            with patch("cluster_agent_task.explain_report", side_effect=mock_explain):
                summary_resume = cluster_agent_task.run_cluster_agent_task(
                    dataset_path=dataset_file,
                    output_path=output_file,
                    summary_path=summary_file,
                    traces_dir=traces_dir,
                    workers=1,
                    limit=None,
                    resume=True,
                    quiet=True,
                )

            self.assertEqual(summary_resume["dataset"]["processed_in_this_run"], 1)
            lines_after = [json.loads(line) for line in output_file.read_text(encoding="utf-8").splitlines() if line.strip()]
            self.assertEqual(len(lines_after), 3)
            self.assertEqual({l["doc_key"] for l in lines_after}, {"test-doc-1", "test-doc-2", "test-doc-3"})


class GlossaryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        saved_patch = patch.object(
            glossario_medico, "SAVED_FILE", Path(self.directory.name) / "parole.json"
        )
        saved_patch.start()
        self.addCleanup(saved_patch.stop)

    def test_find_terms_prefers_longest_match_in_both_languages(self):
        terms = glossario_medico.find_terms(
            ["Nessun versamento pleurico. Atelettasia basale.", "Mild mitral regurgitation."]
        )
        ids = [term["id"] for term in terms]
        self.assertEqual(ids, ["HP:0002202", "HP:0100750", "HP:0001653"])
        self.assertEqual(terms[0]["it"], "Versamento pleurico")

    def test_find_terms_ignores_ambiguous_words(self):
        self.assertEqual(glossario_medico.find_terms(["Aspiration and cutting were performed."]), [])

    def test_glossary_falls_back_to_hpo_definition_when_model_fails(self):
        with patch.object(
            glossario_medico, "_simplify_with_model", side_effect=urllib.error.URLError("offline")
        ):
            terms = glossario_medico.build_glossary("Pneumotorace.", "", "http://x", "m", 5)
        self.assertEqual(terms[0]["id"], "HP:0002107")
        self.assertIsNone(terms[0]["simple_it"])
        self.assertTrue(terms[0]["definition_en"])

    def test_simplifications_are_saved_and_reused(self):
        generated = {"HP:0002107": {"simple_it": "Aria intorno al polmone.", "name_it": "Pneumotorace"}}
        with patch.object(glossario_medico, "_simplify_with_model", return_value=generated) as model:
            glossario_medico.build_glossary("Pneumotorace.", "", "http://x", "m", 5)
            terms = glossario_medico.build_glossary("Pneumotorace.", "", "http://x", "m", 5)
        self.assertEqual(model.call_count, 1)
        self.assertEqual(terms[0]["simple_it"], "Aria intorno al polmone.")
        saved = glossario_medico.saved_terms()
        self.assertEqual(saved[0]["count"], 2)


class FacilitiesTests(unittest.TestCase):
    ELEMENTS = {
        "elements": [
            {"type": "node", "id": 1, "lat": 45.47, "lon": 9.19,
             "tags": {"name": "Studio Rossi", "healthcare": "doctor", "healthcare:speciality": "cardiology"}},
            {"type": "node", "id": 2, "lat": 45.46, "lon": 9.18,
             "tags": {"name": "Centro Cardiologico Bianchi", "amenity": "clinic"}},
            {"type": "way", "id": 3, "center": {"lat": 45.50, "lon": 9.20},
             "tags": {"name": "Ospedale Maggiore", "amenity": "hospital"}},
            {"type": "node", "id": 4, "lat": 45.465, "lon": 9.191,
             "tags": {"name": "Studio Verdi", "healthcare": "doctor", "healthcare:speciality": "dermatology"}},
        ],
        "fetched_at": "2026-10-13T12:00:00+02:00",
        "cached": True,
    }

    def test_keyword_branch_from_report_text(self):
        branch = strutture_sanitarie.keyword_branch(
            "Ecocardiogramma: frazione di eiezione 55%, atrio sinistro dilatato."
        )
        self.assertEqual(branch["id"], "cardiologia")
        self.assertEqual(branch["method"], "parole chiave")

    def test_classify_falls_back_to_keywords_when_model_is_offline(self):
        with patch.object(
            strutture_sanitarie, "_classify_with_model", side_effect=urllib.error.URLError("offline")
        ):
            branch = strutture_sanitarie.classify_report("RX torace: versamento pleurico.", "http://x", "m", 5)
        self.assertEqual(branch["id"], "radiologia")

    def test_facilities_are_filtered_and_ranked_by_relevance(self):
        with patch.object(strutture_sanitarie, "_fetch_elements", return_value=self.ELEMENTS):
            result = strutture_sanitarie.find_facilities(45.4642, 9.19, "cardiologia", 10)
        names = [facility["name"] for facility in result["facilities"]]
        self.assertEqual(names, ["Studio Rossi", "Centro Cardiologico Bianchi", "Ospedale Maggiore"])
        self.assertEqual([f["match"] for f in result["facilities"]], ["specialita", "nome", "ospedale"])

    def test_undeclared_clinics_are_listed_last_as_other(self):
        elements = {**self.ELEMENTS, "elements": self.ELEMENTS["elements"] + [
            {"type": "node", "id": 5, "lat": 45.466, "lon": 9.192,
             "tags": {"name": "Ambulatorio Neri", "healthcare": "clinic"}},
            {"type": "node", "id": 6, "lat": 45.466, "lon": 9.192,
             "tags": {"name": "Farmacia Centrale", "amenity": "pharmacy", "healthcare": "pharmacy"}},
        ]}
        with patch.object(strutture_sanitarie, "_fetch_elements", return_value=elements):
            result = strutture_sanitarie.find_facilities(45.4642, 9.19, "cardiologia", 10)
        last = result["facilities"][-1]
        self.assertEqual((last["name"], last["match"]), ("Ambulatorio Neri", "altro"))
        self.assertNotIn("Farmacia Centrale", [f["name"] for f in result["facilities"]])
        self.assertEqual(result["facilities"][0]["specialita"], ["Cardiologia"])

    def test_profile_city_is_saved_and_returned(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        place = {"lat": 44.837, "lon": 11.619, "label": "Ferrara, Emilia-Romagna"}
        with patch.object(profilo_utente, "PROFILE_FILE", Path(directory.name) / "profilo.json"), \
                patch.object(profilo_utente, "geocode", return_value=place):
            client = web_app.app.test_client()
            self.assertEqual(client.get("/api/profilo").get_json()["profilo"], {})
            saved = client.post("/api/profilo", json={"citta": "ferrara"}).get_json()["profilo"]
            self.assertEqual((saved["citta"], saved["luogo"]), ("Ferrara", place))
            self.assertEqual(client.get("/api/profilo").get_json()["profilo"]["citta"], "Ferrara")

    def test_facilities_endpoint_reports_unavailable_service(self):
        web_app.app.config.update(TESTING=True)
        client = web_app.app.test_client()
        with patch.object(
            web_app, "find_facilities",
            side_effect=strutture_sanitarie.FacilitiesUnavailable("OpenStreetMap è sovraccarico"),
        ):
            response = client.get("/api/facilities?lat=45.46&lon=9.19&branch=cardiologia")
        self.assertEqual(response.status_code, 503)
        self.assertIn("sovraccarico", response.get_json()["error"])


class MedicationTests(unittest.TestCase):
    REPORT = "MEDICATIONS: Metformin 500 mg twice daily for diabetes. Lisinopril 10 mg daily."

    def test_lookup_links_english_names_and_us_brands_to_aifa(self):
        self.assertEqual(farmaci_referti.lookup("metformin")["principio_attivo"], "metformina")
        self.assertEqual(farmaci_referti.lookup("Tylenol")["principio_attivo"], "paracetamolo")
        self.assertEqual(farmaci_referti.lookup("insulin glargine")["principio_attivo"], "insulina glargine")
        self.assertIsNone(farmaci_referti.lookup("farmaco inesistente xyz"))

    def test_model_fields_are_kept_only_if_written_in_the_report(self):
        model_output = [
            {"nome": "Metformin", "dose": "500 mg", "frequenza": "twice daily", "motivo": "for diabetes",
             "uso": "in terapia", "citazione": "Metformin 500 mg twice daily for diabetes."},
            {"nome": "Lisinopril", "dose": "20 mg", "motivo": "per la pressione alta", "uso": "in terapia"},
            {"nome": "Atorvastatin", "dose": "40 mg"},
        ]
        with patch.object(farmaci_referti, "_extract_with_model", return_value=model_output):
            result = farmaci_referti.extract_medications(self.REPORT, "http://x", "m", 5)
        names = [item["nome"] for item in result["items"]]
        self.assertEqual(names, ["Metformin", "Lisinopril"])  # Atorvastatin non è nel referto
        metformin, lisinopril = result["items"]
        self.assertEqual((metformin["dose"], metformin["motivo"]), ("500 mg", "for diabetes"))
        self.assertEqual((lisinopril["dose"], lisinopril["motivo"]), ("", ""))  # dose e motivo inventati
        self.assertEqual(metformin["aifa"]["principio_attivo"], "metformina")

    def test_text_scan_is_used_when_model_is_offline(self):
        with patch.object(
            farmaci_referti, "_extract_with_model", side_effect=urllib.error.URLError("offline")
        ):
            result = farmaci_referti.extract_medications(self.REPORT, "http://x", "m", 5)
        self.assertEqual(result["method"], "ricerca nel testo")
        self.assertEqual({item["nome"] for item in result["items"]}, {"metformin", "lisinopril"})


class UnivocalMedicationTests(unittest.TestCase):
    def test_italian_brand_maps_to_exactly_one_leaflet(self):
        result = farmaci_referti.lookup("Brufen 600 mg")
        self.assertEqual(result["farmaco"]["nome"], "BRUFEN")
        self.assertEqual(result["principio_attivo"], "ibuprofene")
        # le 10 importazioni parallele di Brufen non rendono ambiguo il nome
        self.assertEqual(result["alternative_totali"], 1)

    def test_active_ingredient_or_foreign_brand_is_never_guessed(self):
        for name in ("ibuprofen", "Motrin", "metformin"):
            result = farmaci_referti.lookup(name)
            self.assertIsNone(result["farmaco"], name)
            self.assertEqual(result["corrispondenza"], "da scegliere")
            self.assertGreater(result["alternative_totali"], 1)

    def test_patient_choice_fixes_the_product(self):
        item = {"nome": "Motrin"}
        brufen = next(p["cod"] for p in farmaci_referti.lookup("Motrin")["alternative"] if p["nome"] == "BRUFEN")
        self.assertTrue(farmaci_referti.valid_choice(item, brufen))
        self.assertFalse(farmaci_referti.valid_choice(item, "017758"))  # Glucophage: altro principio attivo
        resolved = farmaci_referti.resolve_medication({**item, "scelta": brufen})
        self.assertEqual(resolved["aifa"]["farmaco"]["nome"], "BRUFEN")
        self.assertEqual(resolved["aifa"]["corrispondenza"], "scelto da te")


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.trace_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.trace_directory.cleanup)
        web_app.app.config.update(TESTING=True, TRACE_DIR=Path(self.trace_directory.name))
        self.client = web_app.app.test_client()

    def _analyze(self, glossary=None):
        medications = {"method": "modello", "items": []}
        with patch("web_app._explain_text", return_value="SINTESI\nTutto nella norma."), \
                patch("web_app._glossary", return_value=glossary or []), \
                patch("web_app._branch", return_value={"id": "radiologia", "label": "Radiologia"}), \
                patch("web_app._medications", return_value=medications):
            response = self.client.post(
                "/api/analyze/text",
                data={"text": "RX torace: nessun versamento pleurico, cuore nei limiti."},
            )
        return response.get_json()["trace_id"]

    def test_analyzed_report_appears_in_history_with_details(self):
        trace_id = self._analyze()
        reports = self.client.get("/api/referti").get_json()["reports"]
        self.assertEqual([r["id"] for r in reports], [trace_id])
        self.assertEqual(reports[0]["summary"], "Tutto nella norma.")
        self.assertEqual(reports[0]["branch"]["label"], "Radiologia")
        detail = self.client.get(f"/api/referti/{trace_id}").get_json()["report"]
        self.assertIn("versamento pleurico", detail["report_text"])

    def test_medications_can_be_extracted_later_and_report_deleted(self):
        trace_id = self._analyze()
        later = {"method": "modello", "items": [{"nome": "x", "aifa": None}]}
        with patch("web_app.extract_medications", return_value=later):
            response = self.client.post(f"/api/referti/{trace_id}/farmaci")
        self.assertEqual(response.status_code, 200)
        overview = self.client.get("/api/farmaci").get_json()
        self.assertEqual(overview["farmaci"][0]["menzioni"][0]["trace_id"], trace_id)
        self.assertEqual(self.client.delete(f"/api/referti/{trace_id}").status_code, 200)
        self.assertEqual(self.client.get("/api/referti").get_json()["reports"], [])

    def test_vocabulary_lists_the_reports_where_a_word_appears(self):
        trace_id = self._analyze(glossary=[{"id": "HP:0002107", "en": "Pneumothorax"}])
        with patch("web_app.saved_terms", return_value=[{"id": "HP:0002107", "en": "Pneumothorax"}]):
            term = self.client.get("/api/glossary").get_json()["terms"][0]
        self.assertEqual([r["id"] for r in term["referti"]], [trace_id])

    def test_choice_endpoint_accepts_only_matching_products(self):
        trace_id = self._analyze()
        medications = {"method": "modello", "items": [{"nome": "Motrin", "dose": "800 mg"}]}
        web_app.update_trace_artifact(Path(self.trace_directory.name), trace_id, "medications", medications)
        brufen = next(p["cod"] for p in farmaci_referti.lookup("Motrin")["alternative"] if p["nome"] == "BRUFEN")
        wrong = self.client.post(f"/api/referti/{trace_id}/farmaci/0/scelta", json={"cod": "017758"})
        self.assertEqual(wrong.status_code, 400)
        ok = self.client.post(f"/api/referti/{trace_id}/farmaci/0/scelta", json={"cod": brufen})
        self.assertEqual(ok.status_code, 200)
        item = self.client.get(f"/api/referti/{trace_id}").get_json()["report"]["medications"]["items"][0]
        self.assertEqual(item["aifa"]["farmaco"]["nome"], "BRUFEN")
        group = self.client.get("/api/farmaci").get_json()["farmaci"][0]
        self.assertEqual(group["chiave"], f"cod:{brufen}")

    def test_leaflet_endpoint_serves_pdf_and_rejects_unknown_codes(self):
        pdf = Path(self.trace_directory.name) / "FI_017758.pdf"
        pdf.write_bytes(b"%PDF-1.7 test")
        with patch("web_app.leaflet_pdf", return_value=pdf):
            response = self.client.get("/api/farmaci/017758/foglietto?tipo=FI")
        self.assertEqual(response.mimetype, "application/pdf")
        response.close()
        self.assertEqual(self.client.get("/api/farmaci/999999999/foglietto").status_code, 404)


if __name__ == "__main__":
    unittest.main()

