# Siilas Review share-card font

`siilas-review-subset.otf` is a renamed subset of [Noto Sans CJK SC Regular](https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf), distributed under SIL Open Font License 1.1. The original copyright notice remains in the font metadata; the license is retained in `siilas-review-OFL.txt`.

This subset supports the airport names and share-card labels used by this project. It is used only while generating PNG files, not preloaded in web pages. Regenerate with `scripts/subset-review-font.py` when new names or labels introduce characters. Normal production builds require only the committed subset and Sharp.
