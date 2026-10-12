import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import benchmarking
import decision_model
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


if __name__ == "__main__":
    unittest.main()

