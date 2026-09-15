#!/usr/bin/env python3
"""
OMR Debug and Diagnostic Tool (5-Stage Visual and Systematic Shift Analysis)
Usage:
    python3 omr_debug_script.py [image_path] [output_dir]
"""

import os
import sys
import io
import json
import cv2
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from core.alignment import detect_corners_and_crop
from core.decoder import decode_field_detailed
from core.detector import calculate_fill_ratio, evaluate_question
from core.evaluator import generate_sample_kunci_excel, parse_kunci_jawaban_excel
from core.pdf_utils import load_image_with_exif

def main():
    if len(sys.argv) < 2:
        img_path = os.path.join(BASE_DIR, "sample foto", "dari pak bagas.jpeg")
        print("No image supplied, using default sample: " + img_path)
    else:
        img_path = sys.argv[1]

    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BASE_DIR, "artefacts", "omr_debug_output")
    os.makedirs(out_dir, exist_ok=True)

    print("=== OMR DIAGNOSTIC SUITE ===")
    print("Target Image : " + str(img_path))
    print("Output Dir   : " + str(out_dir) + "\n")

    with open(img_path, "rb") as f:
        img_bytes = f.read()
    image_bgr = load_image_with_exif(img_bytes)
    if image_bgr is None:
        image_bgr = cv2.imread(img_path)
    if image_bgr is None:
        print("ERROR: Cannot load image from " + str(img_path))
        sys.exit(1)

    # 1. Corner Detection and Warp
    print("[1/5] Running Corner Detection and Perspective Warp...")
    warped, pts, method, c_ids, d_name, status, aruco_reg = detect_corners_and_crop(
        image_bgr, preferred_method="green_frame", crop_mode="inner", apply_standardization=True
    )
    print("  Method : " + str(method))
    print("  Status : " + str(status))
    print("  Canvas : " + str(warped.shape[1]) + "x" + str(warped.shape[0]) + " px")
    warped_path = os.path.join(out_dir, "01_warped_image.jpg")
    cv2.imwrite(warped_path, warped)
    print("  Saved  : " + str(warped_path))

    template_path = os.path.join(BASE_DIR, "template-final.json")
    with open(template_path, "r") as f:
        template = json.load(f)

    soal_fields = ["Soal-A", "Soal-B", "Soal-C", "Soal-D", "Soal-E"]
    questions_map = {}

    for col_idx, col_name in enumerate(soal_fields):
        items = template["fields"].get(col_name, {}).get("items", [])
        start_q = 1 + col_idx * 15
        for it_idx, it in enumerate(items):
            q_num = start_q + it_idx
            questions_map[q_num] = {
                "col": col_name,
                "name": it.get("name", "soal_" + str(q_num)),
                "bubbles": it.get("bubbles", [])
            }

    # 2. Grid Visualization Overlay
    print("\n[2/5] Generating Pixel-Perfect Grid Overlay...")
    overlay = warped.copy()
    colors = [
        (0, 0, 255),
        (0, 180, 0),
        (255, 0, 0),
        (0, 165, 255),
        (180, 0, 180),
    ]

    for q_num, q_info in questions_map.items():
        col_idx = (q_num - 1) // 15
        color = colors[col_idx % len(colors)]
        bubbles = q_info["bubbles"]

        xs = [b["cx"] for b in bubbles]
        ys = [b["cy"] for b in bubbles]
        min_x, max_x = int(min(xs) - 18), int(max(xs) + 18)
        min_y, max_y = int(min(ys) - 16), int(max(ys) + 16)
        cv2.rectangle(overlay, (min_x, min_y), (max_x, max_y), color, 1)
        cv2.putText(overlay, "Q" + str(q_num), (min_x - 38, int(np.mean(ys)) + 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1, cv2.LINE_AA)

        for b in bubbles:
            bx, by = int(round(b["cx"])), int(round(b["cy"]))
            bw = int(round(b.get("w", 26)))
            bh = int(round(b.get("h", 26)))
            cv2.rectangle(overlay, (bx - bw // 2, by - bh // 2), (bx + bw // 2, by + bh // 2), (80, 80, 80), 1)

    grid_path = os.path.join(out_dir, "02_grid_overlay.jpg")
    cv2.imwrite(grid_path, overlay)
    print("  Saved  : " + str(grid_path))

    # 3. Mark Extraction and Cell Crops
    print("\n[3/5] Extracting Marks and Saving Sample Cell Crops...")
    gray_warped = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    paper_bg = float(np.percentile(gray_warped, 92))

    detected_answers = {}
    detected_conf = {}
    detected_status = {}

    for q_num in sorted(questions_map.keys()):
        q_info = questions_map[q_num]
        bubbles = q_info["bubbles"]
        ratios = []

        for b in bubbles:
            glyph = b.get("option")
            r = calculate_fill_ratio(
                gray_warped, b["cx"], b["cy"], b.get("radius", 12),
                shape=b.get("shape", "square"), w=b.get("w"), h=b.get("h"),
                paper_bg=paper_bg, option_glyph=glyph
            )
            ratios.append(r)

        idx, status_q = evaluate_question(ratios, threshold=0.32, ambiguous_margin=0.08)
        ans = bubbles[idx].get("option") if (status_q in ("OK", "MULTIPLE") and 0 <= idx < len(bubbles)) else ("BLANK" if status_q == "BLANK" else status_q)
        conf = round(float(ratios[idx]) * 100, 1) if (0 <= idx < len(bubbles)) else 0.0

        detected_answers[q_num] = ans
        detected_conf[q_num] = conf
        detected_status[q_num] = status_q

        if q_num in [4, 5, 6, 9]:
            for b in bubbles:
                opt = b.get("option", "X")
                cx, cy = int(round(b["cx"])), int(round(b["cy"]))
                pad = 18
                cell_crop = warped[max(0, cy - pad):min(warped.shape[0], cy + pad),
                                   max(0, cx - pad):min(warped.shape[1], cx + pad)]
                cell_name = "cell_Q" + str(q_num) + "_" + str(opt) + ".jpg"
                cv2.imwrite(os.path.join(out_dir, cell_name), cell_crop)

    print("  Extracted answers for " + str(len(detected_answers)) + " questions.")
    print("  Cell crops saved for Q4, Q5, Q6, Q9.")

    # 4. Answer Comparison
    print("\n[4/5] Evaluating Against Standard Answer Key (kj122)...")
    kunci_sheets = parse_kunci_jawaban_excel(io.BytesIO(generate_sample_kunci_excel()))
    answer_key = kunci_sheets.get("kj122", kunci_sheets.get(list(kunci_sheets.keys())[0]))

    report_lines = []
    report_lines.append("=" * 65)
    report_lines.append("           OMR DETAILED COMPARISON REPORT (1 - 75)")
    report_lines.append("=" * 65)
    report_lines.append("%4s | %9s | %6s | %10s | %6s | %6s" % ("Q#", "Student", "Key", "Status", "Match", "Conf"))
    report_lines.append("-" * 65)

    benar = 0
    salah = 0
    kosong = 0

    for q in range(1, 76):
        stu = detected_answers.get(q, "BLANK")
        key = answer_key.get(q, "-")
        conf = detected_conf.get(q, 0.0)

        is_blank = stu in ["BLANK", "?", "-", "None", ""]
        is_match = (str(stu).upper() == str(key).upper()) and not is_blank

        if is_match:
            benar += 1
            st_label = "BENAR"
            sym = "[OK]"
        elif is_blank:
            kosong += 1
            st_label = "KOSONG"
            sym = "[-]"
        else:
            salah += 1
            st_label = "SALAH"
            sym = "[X]"

        report_lines.append("%4d | %9s | %6s | %10s | %6s | %5.1f%%" % (q, stu, key, st_label, sym, conf))

    report_lines.append("-" * 65)
    score = round((benar / 75.0) * 100, 1)
    report_lines.append("Summary: Benar=%d (Score: %.1f%%), Salah=%d, Kosong=%d | Total=75" % (benar, score, salah, kosong))
    report_lines.append("=" * 65 + "\n")

    # 5. Offset Hypothesis Test
    print("\n[5/5] Running Offset Hypothesis Test (Range: -7 to +7)...")
    report_lines.append("=" * 65)
    report_lines.append("            OFFSET HYPOTHESIS TEST (SHIFT ANALYSIS)")
    report_lines.append("=" * 65)
    report_lines.append("%10s | %12s | %12s | %-20s" % ("Offset", "Correct", "Accuracy", "Note"))
    report_lines.append("-" * 65)

    best_off = 0
    best_acc = -1.0

    for off in range(-7, 8):
        adj_correct = 0
        for q_num, ans in detected_answers.items():
            if ans in ["BLANK", "?", "-", "None", ""]:
                continue
            adj_q = q_num + off
            if 1 <= adj_q <= 75 and adj_q in answer_key:
                if str(ans).upper() == str(answer_key[adj_q]).upper():
                    adj_correct += 1

        acc = (adj_correct / 75.0) * 100.0
        note = "Current State" if off == 0 else ""
        if acc > best_acc:
            best_acc = acc
            best_off = off

        off_str = "Offset %+d" % off
        report_lines.append("%10s | %4d/75       | %8.1f%%   | %-20s" % (off_str, adj_correct, acc, note))

    report_lines.append("-" * 65)
    report_lines.append("Best Offset: %+d with accuracy %.1f%%" % (best_off, best_acc))
    if abs(best_acc - score) < 5.0:
        report_lines.append("INSIGHT: No systematic grid shift. Student filled uniform option.")
    else:
        report_lines.append("INSIGHT: Grid shift detected! Shifting by %+d improves match rate." % best_off)
    report_lines.append("=" * 65)

    report_text = "\n".join(report_lines)
    report_path = os.path.join(out_dir, "03_comparison_report.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_text)

    print(report_text)
    print("\nAll artifacts generated cleanly in: " + str(out_dir))

if __name__ == "__main__":
    main()
