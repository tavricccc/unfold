#!/bin/sh
# Render every screen (or the ones given) in light and dark at 1440x900 into shots/.
cd "$(dirname "$0")/.." || exit 1
files="$*"; [ -z "$files" ] && files=$(ls *.html | grep -v -- '--dark')
list=""
for f in $files; do
  d="${f%.html}--dark.html"
  sed 's/data-theme="light"/data-theme="dark"/' "$f" > "$d"
  list="$list $f $d"
done
node C:/Users/Tavric/.claude/skills/oil-ui/scripts/shoot.mjs $list --size 1440x900 --out shots 2>&1 | grep -E "提示|通过|失败|错误"
for f in $files; do rm -f "${f%.html}--dark.html"; done
