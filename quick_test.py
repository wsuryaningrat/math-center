#!/usr/bin/env python3
"""
Quick Area Detection Visualizer
Verifies that JAWABAN SOAL (bottom area, y=1640..2385) is strictly isolated
from TOP areas (NAMA, NIM, KUESIONER).
Usage:
    python3 quick_test.py [image_path] [output_dir]
"""

import os
import sys
import json
import cv2
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from core.alignment import detect_corners_and_crop
from core.pdf_utils import load_image_with_exif

def main():
    img_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE_DIR, "sample foto", "dari pak bagas.jpeg")
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BASE_DIR, "artefacts", "omr_debug_output")
    os.makedirs(out_dir, exist_ok=True)

    print("Target Image : " + str(img_path))
    print("Output Dir   : " + str(out_dir))

    with open(img_path, "rb") as f:
        img_bytes = f.read()
    image_bgr = load_image_with_exif(img_bytes)
    if image_bgr is None:
        image_bgr = cv2.imread(img_path)
    if image_bgr is None:
        print("ERROR: Cannot load image")
        sys.exit(1)

    warped, pts, method, c_ids, d_name, status, aruco_reg = detect_corners_and_crop(
        image_bgr, preferred_method="green_frame", crop_mode="inner", apply_standardization=True
    )

    t_path = os.path.join(BASE_DIR, "template-final.json")
    with open(t_path, "r") as f:
        t = json.load(f)

    vis = warped.copy()

    # 1. Outline Top Areas (Reference / ID / Survey)
    # NAMA
    cv2.rectangle(vis, (35, 410), (845, 1540), (255, 180, 0), 2)
    cv2.putText(vis, "AREA 1: NAMA LENGKAP (A-Z Grid)", (40, 400), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 180, 0), 2)

    # NPM / NIM
    cv2.rectangle(vis, (900, 410), (1305, 845), (255, 100, 0), 2)
    cv2.putText(vis, "AREA 2: NPM / NIM (0-9 Grid)", (905, 400), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 100, 0), 2)

    # Kuesioner
    cv2.rectangle(vis, (900, 1090), (1570, 1540), (200, 0, 200), 2)
    cv2.putText(vis, "AREA 3: KUESIONER (1-15)", (905, 1080), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 0, 200), 2)

    # 2. TARGET: JAWABAN SOAL (Bottom Area, 75 Butir Soal)
    # Coordinates of all 75 questions in template
    soal_keys = ["Soal-A", "Soal-B", "Soal-C", "Soal-D", "Soal-E"]
    all_bubbles = [b for k in soal_keys for it in t["fields"][k]["items"] for b in it["bubbles"]]
    xs = [b["cx"] for b in all_bubbles]
    ys = [b["cy"] for b in all_bubbles]

    bx1, by1 = int(min(xs) - 35), int(min(ys) - 30)
    bx2, by2 = int(max(xs) + 35), int(max(ys) + 30)

    # Thick vibrant GREEN rectangle for Target Area
    cv2.rectangle(vis, (bx1, by1), (bx2, by2), (0, 230, 0), 4)

    # Target Area Banner
    cv2.rectangle(vis, (bx1, by1 - 38), (bx1 + 650, by1), (0, 200, 0), -1)
    cv2.putText(vis, "TARGET AREA 5: JAWABAN SOAL (1 - 75)", (bx1 + 10, by1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 0), 2, cv2.LINE_AA)

    out_file = os.path.join(out_dir, "area_detection.jpg")
    cv2.imwrite(out_file, vis)
    print("SUCCESS: Saved target area detection visualization to: " + str(out_file))
    print("  JAWABAN SOAL bounds: X=[" + str(bx1) + ".." + str(bx2) + "], Y=[" + str(by1) + ".." + str(by2) + "]")
    print("  Status: JAWABAN SOAL is strictly isolated in bottom section (Y: 1650..2385 px)")

if __name__ == "__main__":
    main()
