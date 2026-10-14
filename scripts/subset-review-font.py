"""One-off font maintenance: python3 scripts/subset-review-font.py ORIGINAL_NOTO_OTF.

Requires fontTools only for regeneration; normal builds use the committed subset.
Original font: https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
License: SIL OFL 1.1. The modified subset is renamed Siilas Review.
"""
import json
import sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
names = ''.join(a['name'] for a in json.loads((root / 'src/data/airports.json').read_text()))
corpus = names + (root / 'src/lib/airport-share-image.ts').read_text() + (root / 'src/data/airport-review.ts').read_text()
unicodes = set(range(32, 127)) | {ord(c) for c in corpus if ord(c) > 127}
font = TTFont(sys.argv[1])
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)
for record in font['name'].names:
    if record.nameID in {1, 3, 4, 6, 16, 17}:
        value = {1:'Siilas Review', 3:'SiilasReview-Subset-1', 4:'Siilas Review Regular', 6:'SiilasReview-Regular', 16:'Siilas Review', 17:'Regular'}[record.nameID]
        record.string = value.encode(record.getEncoding())
if 'CFF ' in font:
    top = font['CFF '].cff.topDictIndex[0]
    top.FullName = 'Siilas Review Regular'
    top.FamilyName = 'Siilas Review'
    font['CFF '].cff.fontNames = ['SiilasReview-Regular']
font_dir = root / 'src/assets/fonts'
font.save(font_dir / 'siilas-review-subset.otf')
(font_dir / 'siilas-review-characters.txt').write_text(''.join(chr(code) for code in sorted(unicodes)))
print('Share-card font subset regenerated.')
