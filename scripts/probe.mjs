// 공공데이터포털 오픈API를 실제로 한 번 호출해 원본 응답 구조를 확인하는 스크립트.
// 수집 어댑터를 작성하기 전에 필드 이름·타입·중첩 구조를 눈으로 보는 용도다.
//
// 사용법:
//   node scripts/probe.mjs alio
//   node scripts/probe.mjs alio numOfRows=10 pageNo=2
//   node scripts/probe.mjs worknet

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// .env를 직접 파싱한다 (의존성 설치 전에도 돌아가야 하므로 dotenv를 쓰지 않는다)
function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, ".env"), "utf8");
    return Object.fromEntries(
      raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const eq = line.indexOf("=");
          return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
        })
        .filter(([key]) => key)
    );
  } catch {
    console.error("[!] .env 파일이 없습니다.  cp .env.example .env  후 키를 채우세요.");
    process.exit(1);
  }
}

// 소스별 엔드포인트와 기본 파라미터.
// endpoint는 공공데이터포털 마이페이지의 End Point 값을 .env에 넣어 사용한다.
const SOURCES = {
  alio: {
    label: "공공기관 채용정보 (잡알리오)",
    endpointEnv: "ALIO_API_ENDPOINT",
    defaultParams: { numOfRows: "5", pageNo: "1", resultType: "json" },
  },
  worknet: {
    label: "워크넷 채용정보 (고용24)",
    endpointEnv: "WORKNET_API_ENDPOINT",
    defaultParams: { numOfRows: "5", pageNo: "1", returnType: "JSON" },
  },
};

// 응답을 JSON으로 파싱해보고, 실패하면 원문을 그대로 돌려준다.
// data.go.kr은 오류 시 resultType=json이어도 XML을 반환하는 경우가 많다.
function tryParse(text) {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, data: null };
  }
}

// 응답에서 실제 레코드 배열을 찾아낸다. 스키마가 소스마다 달라 탐색적으로 접근한다.
function findRecordArray(node, depth = 0) {
  if (depth > 6 || node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.length && typeof node[0] === "object" ? node : null;
  for (const value of Object.values(node)) {
    const found = findRecordArray(value, depth + 1);
    if (found) return found;
  }
  return null;
}

async function main() {
  const [sourceName, ...paramArgs] = process.argv.slice(2);
  const source = SOURCES[sourceName];

  if (!source) {
    console.error(`사용 가능한 소스: ${Object.keys(SOURCES).join(", ")}`);
    process.exit(1);
  }

  const env = loadEnv();
  const endpoint = env[source.endpointEnv];
  const serviceKey = env.DATA_GO_KR_SERVICE_KEY;

  if (!endpoint) {
    console.error(`[!] .env에 ${source.endpointEnv}가 비어 있습니다.`);
    console.error("    공공데이터포털 마이페이지의 End Point 값을 넣으세요.");
    process.exit(1);
  }
  if (!serviceKey) {
    console.error("[!] .env에 DATA_GO_KR_SERVICE_KEY가 비어 있습니다. (Decoding 키)");
    process.exit(1);
  }

  // CLI로 넘긴 key=value가 기본 파라미터를 덮어쓴다
  const overrides = Object.fromEntries(
    paramArgs.map((arg) => {
      const eq = arg.indexOf("=");
      return [arg.slice(0, eq), arg.slice(eq + 1)];
    })
  );

  // URLSearchParams가 자동 인코딩하므로 Decoding 키를 그대로 넣는다.
  // Encoding 키를 넣으면 이중 인코딩되어 SERVICE_KEY_IS_NOT_REGISTERED_ERROR가 난다.
  const params = new URLSearchParams({
    serviceKey,
    ...source.defaultParams,
    ...overrides,
  });
  const url = `${endpoint}?${params}`;

  console.log(`\n[소스] ${source.label}`);
  console.log(`[요청] ${url.replace(serviceKey, "***")}\n`);

  const res = await fetch(url);
  const text = await res.text();

  console.log(`[상태] ${res.status} ${res.statusText}`);
  console.log(`[타입] ${res.headers.get("content-type")}\n`);

  const parsed = tryParse(text);

  if (!parsed.ok) {
    // XML 오류 응답이 대부분이다. 원문을 그대로 보여줘야 원인을 알 수 있다.
    console.log("[원문] JSON 파싱 실패 — 응답 원문:\n");
    console.log(text.slice(0, 2000));
    process.exit(1);
  }

  // 원본 응답 전체를 파일로 남긴다 (samples/는 .gitignore 처리됨)
  const outDir = resolve(ROOT, "samples");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${sourceName}-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(parsed.data, null, 2), "utf8");

  const records = findRecordArray(parsed.data);

  if (records) {
    console.log(`[레코드] ${records.length}건 확인\n`);
    console.log("[필드 목록]");
    for (const key of Object.keys(records[0])) {
      const value = records[0][key];
      const preview = typeof value === "object" ? JSON.stringify(value) : String(value);
      console.log(`  ${key.padEnd(28)} ${preview.slice(0, 60)}`);
    }
  } else {
    console.log("[구조] 레코드 배열을 찾지 못했습니다. 저장된 파일을 직접 확인하세요.\n");
    console.log(JSON.stringify(parsed.data, null, 2).slice(0, 2000));
  }

  console.log(`\n[저장] ${outPath}`);
}

main().catch((err) => {
  console.error("[!] 호출 실패:", err.message);
  process.exit(1);
});
