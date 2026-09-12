// 오픈API를 실제로 한 번 호출해 원본 응답 구조를 확인하는 스크립트.
// 수집 어댑터를 작성하기 전에 필드 이름·타입·중첩 구조를 눈으로 보는 용도다.
//
// 사용법:
//   node scripts/probe.mjs alio
//   node scripts/probe.mjs alio numOfRows=10 pageNo=2
//   node scripts/probe.mjs worknet
//   node scripts/probe.mjs worknet returnType=JSON display=20

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

// 소스별 호출 규약.
// 공공데이터포털(data.go.kr)과 고용24(work24.go.kr)는 인증 파라미터 이름부터 페이징 방식까지
// 전부 다르다. 어댑터가 결국 흡수해야 할 차이라서 프로브 단계부터 소스별로 분리해 둔다.
const SOURCES = {
  alio: {
    label: "공공기관 채용정보 (잡알리오) — data.go.kr",
    endpointEnv: "ALIO_API_ENDPOINT",
    keyEnv: "DATA_GO_KR_SERVICE_KEY",
    keyParam: "serviceKey",
    keyHint: "공공데이터포털 마이페이지 > 개발계정 상세보기의 일반 인증키(Decoding)",
    defaultParams: { numOfRows: "5", pageNo: "1", resultType: "json" },
  },
  worknet: {
    label: "워크넷 채용정보 목록 (고용24) — work24.go.kr",
    endpointEnv: "WORKNET_API_ENDPOINT",
    // 고용24는 요청 URL이 명세에 고정 공개돼 있어 .env가 비어 있어도 동작한다
    fallbackEndpoint:
      "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do",
    keyEnv: "WORK24_API_KEY",
    keyParam: "authKey",
    keyHint: "고용24 > OPEN-API > 서비스 소개 및 신청에서 발급받은 인증키",
    // callTp: L=목록 / D=상세, 페이징은 startPage·display (pageNo·numOfRows가 아니다)
    defaultParams: { callTp: "L", returnType: "XML", startPage: "1", display: "5" },
  },
};

// 응답을 JSON으로 파싱해본다.
function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// XML 엔티티를 원문자로 되돌린다. 공고 제목·회사명에 &amp;, &lt;가 그대로 실려 온다.
function decodeEntities(text) {
  const named = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
  return text.replace(/&(?:#(\d+)|#x([\da-fA-F]+)|([a-z]+));/gi, (all, dec, hex, name) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return named[name.toLowerCase()] ?? all;
  });
}

// XML을 객체 트리로 바꾼다.
// 고용24는 returnType=XML이 기본이고, data.go.kr도 오류 시 resultType=json을 무시하고 XML을 준다.
// 두 경우 모두 JSON 응답과 같은 방식으로 훑기 위해 최소한의 파서를 직접 둔다.
// (데이터 피드 전용 — 속성과 혼합 콘텐츠는 다루지 않는다)
function parseXml(xml) {
  const values = [{}];
  const names = [];
  let text = "";
  const token =
    /<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<\/([^>]+)>|<([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;

  // 닫히는 요소를 부모에 붙인다. 같은 이름이 반복되면 배열로 모은다.
  const attach = (name, value) => {
    const parent = values[values.length - 1];
    if (parent[name] === undefined) parent[name] = value;
    else if (Array.isArray(parent[name])) parent[name].push(value);
    else parent[name] = [parent[name], value];
  };

  let match;
  while ((match = token.exec(xml)) !== null) {
    const [, cdata, closing, opening, , selfClosing, chars] = match;

    if (cdata !== undefined) text += cdata;
    else if (closing !== undefined) {
      const node = values.pop();
      attach(names.pop(), Object.keys(node).length ? node : text.trim());
      text = "";
    } else if (opening !== undefined) {
      if (selfClosing) attach(opening, "");
      else {
        values.push({});
        names.push(opening);
        text = "";
      }
    } else if (chars !== undefined) text += decodeEntities(chars);
  }

  return values[0];
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

// 레코드 배열을 감싸고 있는 껍데기에서 총건수 같은 스칼라 값만 모은다
function collectScalars(node, depth = 0, out = {}) {
  if (depth > 4 || node == null || typeof node !== "object" || Array.isArray(node)) return out;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "object") collectScalars(value, depth + 1, out);
    else if (out[key] === undefined) out[key] = value;
  }
  return out;
}

async function main() {
  const [sourceName, ...paramArgs] = process.argv.slice(2);
  const source = SOURCES[sourceName];

  if (!source) {
    console.error(`사용 가능한 소스: ${Object.keys(SOURCES).join(", ")}`);
    process.exit(1);
  }

  const env = loadEnv();
  const endpoint = env[source.endpointEnv] || source.fallbackEndpoint;
  const authValue = env[source.keyEnv];

  if (!endpoint) {
    console.error(`[!] .env에 ${source.endpointEnv}가 비어 있습니다.`);
    console.error("    API 상세 페이지의 요청 URL(End Point)을 넣으세요.");
    process.exit(1);
  }
  if (!authValue) {
    console.error(`[!] .env에 ${source.keyEnv}가 비어 있습니다.`);
    console.error(`    ${source.keyHint}`);
    process.exit(1);
  }

  // CLI로 넘긴 key=value가 기본 파라미터를 덮어쓴다
  const overrides = Object.fromEntries(
    paramArgs.map((arg) => {
      const eq = arg.indexOf("=");
      return [arg.slice(0, eq), arg.slice(eq + 1)];
    })
  );

  // URLSearchParams가 자동 인코딩하므로 키는 디코딩된 원본을 그대로 넣는다.
  // data.go.kr Encoding 키를 넣으면 이중 인코딩되어 SERVICE_KEY_IS_NOT_REGISTERED_ERROR가 난다.
  const params = new URLSearchParams({
    [source.keyParam]: authValue,
    ...source.defaultParams,
    ...overrides,
  });
  const url = `${endpoint}?${params}`;

  console.log(`\n[소스] ${source.label}`);
  console.log(`[요청] ${url.replace(encodeURIComponent(authValue), "***").replace(authValue, "***")}\n`);

  const res = await fetch(url);
  const text = await res.text();

  console.log(`[상태] ${res.status} ${res.statusText}`);
  console.log(`[타입] ${res.headers.get("content-type")}\n`);

  // 선언된 타입을 믿지 않고 본문 첫 글자로 판별한다
  const body = text.trim();
  const data = body.startsWith("<") ? parseXml(body) : tryJson(body);

  if (!data) {
    console.log("[원문] JSON·XML 어느 쪽으로도 파싱되지 않았습니다 — 응답 원문:\n");
    console.log(text.slice(0, 2000));
    process.exit(1);
  }

  // 원본 응답 전체를 파일로 남긴다 (samples/는 .gitignore 처리됨)
  const outDir = resolve(ROOT, "samples");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${sourceName}-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

  const records = findRecordArray(data);

  if (records) {
    const meta = collectScalars(data);
    if (Object.keys(meta).length) {
      console.log("[응답 메타]");
      for (const [key, value] of Object.entries(meta)) {
        console.log(`  ${key.padEnd(20)} ${String(value).slice(0, 60)}`);
      }
      console.log("");
    }

    console.log(`[레코드] ${records.length}건 확인\n`);
    console.log("[필드 목록]");
    for (const key of Object.keys(records[0])) {
      const value = records[0][key];
      const preview = typeof value === "object" ? JSON.stringify(value) : String(value);
      console.log(`  ${key.padEnd(28)} ${preview.slice(0, 60)}`);
    }
  } else {
    console.log("[구조] 레코드 배열을 찾지 못했습니다. 저장된 파일을 직접 확인하세요.\n");
    console.log(JSON.stringify(data, null, 2).slice(0, 2000));
  }

  console.log(`\n[저장] ${outPath}`);
}

main().catch((err) => {
  console.error("[!] 호출 실패:", err.message);
  process.exit(1);
});
