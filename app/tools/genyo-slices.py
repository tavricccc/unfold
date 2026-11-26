"""Cut one OTF into unicode-range woff2 slices.

python tools/genyo-slices.py <font.otf> <out-dir> <prefix> <slices.json>
slices.json is a list of [name, [[start, end], ...]]. Prints the names of slices that held glyphs.
"""
import json
import os
import sys
from multiprocessing import Pool

from fontTools import subset
from fontTools.ttLib import TTFont

FONT, OUT, PREFIX, SLICES = sys.argv[1:5]


def cut(item):
    name, ranges = item
    font = TTFont(FONT, lazy=True)
    cmap = font.getBestCmap()
    codes = [c for a, b in ranges for c in range(a, b + 1) if c in cmap]
    if not codes:
        return None
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.hinting = False
    opts.desubroutinize = True
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=codes)
    font = TTFont(FONT)
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(os.path.join(OUT, f'{PREFIX}-{name}.woff2'))
    return name


if __name__ == '__main__':
    with open(SLICES, encoding='utf-8') as f:
        items = json.load(f)
    with Pool(max(1, (os.cpu_count() or 2) - 1)) as pool:
        for name in pool.imap(cut, items):
            if name:
                print(name)
