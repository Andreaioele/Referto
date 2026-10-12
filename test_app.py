import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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

    @patch("web_app._explain_text", return_value="SPIEGAZIONE DATASET")
    def test_dataset_endpoint(self, _mock):
        payload = b'{"dataset":"test","doc_key":1,"sentences":[["REFERTO",":","Nella","norma","."]]}\n'
        with tempfile.TemporaryDirectory() as temp_name:
            with patch.object(web_app, "RESULTS_DIR", Path(temp_name)):
                response = self.client.post(
                    "/api/analyze/dataset",
                    data={
                        "limit": "1",
                        "dataset": (io.BytesIO(payload), "sample.jsonl"),
                    },
                    content_type="multipart/form-data",
                )
                self.assertEqual(response.status_code, 200)
                data = response.get_json()
                self.assertEqual(data["processed"], 1)
                self.assertEqual(data["successes"], 1)

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


if __name__ == "__main__":
    unittest.main()
