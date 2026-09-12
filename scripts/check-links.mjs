// 마크다운 문서의 상대 링크가 실제 파일을 가리키는지 검사한다.
// 문서를 rename하거나 옮겼을 때 링크가 조용히 깨지는 것을 CI에서 잡기 위한 용도.
//
// 사용법: node scripts/check-links.mjs

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "samples"]);

// 검사 대상 마크다운 파일을 재귀적으로 수집한다
function collectMarkdown(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collectMarkdown(full));
    else if (entry.endsWith(".md")) found.push(full);
  }
  return found;
}

// [텍스트](대상) 형태의 링크에서 대상만 뽑아낸다.
// 이미지(![...]), 외부 URL, 페이지 내 앵커는 검사 대상이 아니다.
function extractLocalLinks(content) {
  const links = [];
  const pattern = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const [, isImage, target] = match;
    if (isImage) continue;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    links.push({ target, index: match.index });
  }
  return links;
}

// 문자 위치를 줄 번호로 변환한다 (오류 메시지에 파일:줄 형태로 찍기 위함)
function lineOf(content, index) {
  return content.slice(0, index).split("\n").length;
}

const files = collectMarkdown(ROOT);
const failures = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const { target, index } of extractLocalLinks(content)) {
    // 파일 내 앵커(#)는 떼고 경로만 확인한다
    const path = target.split("#")[0];
    if (!path) continue;
    const resolved = resolve(dirname(file), decodeURIComponent(path));
    if (!existsSync(resolved)) {
      failures.push({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        line: lineOf(content, index),
        target,
      });
    }
  }
}

console.log(`마크다운 ${files.length}개 검사 완료`);

if (failures.length) {
  console.error(`\n깨진 링크 ${failures.length}건:\n`);
  for (const f of failures) console.error(`  ${f.file}:${f.line}  →  ${f.target}`);
  process.exit(1);
}

console.log("깨진 링크 없음");
