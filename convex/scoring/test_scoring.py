"""Run: python3 -m unittest convex/scoring/test_scoring.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from scoring import score_gpc, score_options  # noqa: E402

PREFS = {"brand": "Brooks", "size": "10.5", "width": "wide"}


def row(item, store="Brooks Running", price=140, disc=25, stock="true"):
    return {"item": item, "store": store, "price": price, "mil_discount_pct": disc,
            "url": "https://example.test", "captured_at": "2026-11-20T12:00:00-08:00", "in_stock": stock}


class ScoringTest(unittest.TestCase):
    def test_verified_discount_applied_and_full_fit(self):
        out = score_options([row("Brooks Ghost 16 Men's 10.5 Wide")], PREFS, 150, {"Brooks Running"})
        o = out["options"][0]
        self.assertEqual(o["price"], 105.0)
        self.assertEqual(o["terms"]["fit"], 0.45)
        self.assertEqual(o["terms"]["discount"], 0.25)

    def test_unverified_discount_not_applied(self):
        out = score_options([row("Brooks Ghost 16 Men's 10.5 Wide")], PREFS, 150, set())
        o = out["options"][0]
        self.assertEqual(o["price"], 140.0)
        self.assertEqual(o["terms"]["discount"], 0.0)
        self.assertIn("not verified", o["discount_note"])

    def test_rejects(self):
        rows = [row("Brooks Ghost 16 Men's 10.5 Wide", stock="false"),
                row("Brooks Ghost 16 Men's 10 Wide"),
                row("Brooks Ghost 16 Men's 10.5 Regular"),
                row("Brooks Ghost 16 Men's 10.5 Wide", price=400, disc=0)]
        out = score_options(rows, PREFS, 150, {"Brooks Running"})
        reasons = [r["reason"] for r in out["rejected"]]
        self.assertEqual(out["options"], [])
        self.assertTrue(reasons[0].startswith("out of stock"))
        self.assertTrue(reasons[1].startswith("wrong size"))
        self.assertTrue(reasons[2].startswith("wrong width"))
        self.assertTrue(reasons[3].startswith("over budget"))

    def test_top2_and_overflow_rejected(self):
        rows = [row("Brooks Ghost 16 Men's 10.5 Wide"),
                row("Nike Pegasus 41 Men's 10.5 Wide", store="Nike", disc=10),
                row("Brooks Ghost 16 Men's 10.5 Wide", store="Other", price=129, disc=10)]
        out = score_options(rows, PREFS, 150, {"Brooks Running", "Nike"})
        self.assertEqual(len(out["options"]), 2)
        self.assertEqual(out["options"][0]["store"], "Brooks Running")
        self.assertIn("lower score", out["rejected"][-1]["reason"])

    def test_lock_has_neutral_size(self):
        out = score_options([row("Master Lock combination padlock", store="X", price=9, disc=0)],
                            PREFS, 45, set())
        self.assertEqual(len(out["options"]), 1)


def grow(item, store="Vendor", price=500, mandatory="", banned="false", berry="false", coo="US",
         tags="cold-weather", stock="true"):
    return {"item": item, "store": store, "price": price, "url": "https://example.test",
            "captured_at": "2026-11-20T12:00:00-08:00", "in_stock": stock, "mandatory_source": mandatory,
            "vendor_banned_889": banned, "berry_covered": berry, "country_of_origin": coo, "spec_tags": tags}


class GpcTest(unittest.TestCase):
    def test_mandatory_gate_beats_cheaper_vendor(self):
        rows = [grow("Gloves A1", store="AbilityOne", price=1400, mandatory="AbilityOne"),
                grow("Gloves cheap", price=10)]
        out = score_gpc(rows, ["cold-weather"], 1500)
        self.assertEqual([o["store"] for o in out["options"]], ["AbilityOne"])
        self.assertEqual(out["rejected"][0]["rule"], "FAR 8.002")

    def test_gate_skipped_when_mandatory_misses_spec(self):
        rows = [grow("Liners", store="AbilityOne", mandatory="AbilityOne", tags="liner"),
                grow("Cold gloves")]
        out = score_gpc(rows, ["cold-weather"], 1500)
        self.assertEqual([o["item"] for o in out["options"]], ["Cold gloves"])
        self.assertIn("does not meet", out["rejected"][0]["reason"])

    def test_889_by_flag_and_name(self):
        rows = [grow("Hikvision camera"), grow("Radio", store="Acme", banned="true")]
        out = score_gpc(rows, ["cold-weather"], 1500)
        self.assertEqual(out["options"], [])
        self.assertTrue(all(r["rule"] == "FAR 52.204-25" for r in out["rejected"]))

    def test_berry_only_when_applies(self):
        rows = [grow("Gloves", berry="true", coo="CN")]
        self.assertEqual(len(score_gpc(rows, ["cold-weather"], 1500)["options"]), 1)
        out = score_gpc(rows, ["cold-weather"], 1500, berry_applies=True)
        self.assertEqual(out["rejected"][0]["rule"], "DFARS 252.225-7012")

    def test_formula(self):
        out = score_gpc([grow("Rugged tablet", price=750, tags="rugged")], ["rugged", "cold-weather"], 1500)
        self.assertEqual(out["options"][0]["terms"], {"price": 0.3, "spec": 0.2})


if __name__ == "__main__":
    unittest.main()
