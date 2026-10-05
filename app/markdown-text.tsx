"use client";

/**
 * 챗봇 답변에 섞여 오는 마크다운을 최소한만 사람이 읽는 모양으로 옮긴다.
 *
 * 백엔드 프롬프트가 굵게·목록·제목을 쓰라고 지시하지 않아도 모델이 습관적으로 쓰기
 * 때문에, 렌더러가 없으면 말풍선에 `**이렇게**` 원문이 그대로 찍힌다. 라이브러리를
 * 더하지 않고 굵게/기울임/인라인 코드/글머리 기호/번호 목록/제목/구분선만 처리한다 —
 * 채팅에서 실제로 쓰이는 것이 그 정도이고, 그 이상은 HTML 주입 위험만 키운다.
 *
 * **문자열을 HTML로 만들지 않는다.** 전부 React 노드로 쪼개므로 사용자 입력이나
 * 모델 출력이 태그로 해석될 여지가 없다.
 */

import type { ReactNode } from "react";

/** 한 줄 안의 `**굵게**`, `*기울임*`, `` `코드` `` 를 노드로 쪼갠다. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong className="font-bold text-gray-900" key={key}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.92em] font-mono" key={key}>
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!listBuffer) return;
    const { ordered, items } = listBuffer;
    const className = "my-1 space-y-0.5 pl-4 " + (ordered ? "list-decimal" : "list-disc");
    blocks.push(
      ordered ? (
        <ol className={className} key={key}>
          {items.map((item, i) => (
            <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ol>
      ) : (
        <ul className={className} key={key}>
          {items.map((item, i) => (
            <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ul>
      ),
    );
    listBuffer = null;
  };

  lines.forEach((rawLine, lineIndex) => {
    // 모델이 수식을 LaTeX처럼 `$x^2$`로 감싸 보내면 달러 기호가 그대로 찍힌다 — 감싼
    // 기호만 걷어 낸다(수식 렌더러는 두지 않는다).
    const line = rawLine.trimEnd().replace(/\$\$?([^$\n]+?)\$\$?/g, "$1");
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushList(`list-${lineIndex}`);
      blocks.push(<hr className="my-2 border-gray-200" key={`hr-${lineIndex}`} />);
      return;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);

    if (bullet) {
      if (listBuffer && listBuffer.ordered) flushList(`list-${lineIndex}`);
      listBuffer ??= { ordered: false, items: [] };
      listBuffer.items.push(bullet[1]);
      return;
    }
    if (ordered) {
      if (listBuffer && !listBuffer.ordered) flushList(`list-${lineIndex}`);
      listBuffer ??= { ordered: true, items: [] };
      listBuffer.items.push(ordered[2]);
      return;
    }

    flushList(`list-${lineIndex}`);

    if (heading) {
      blocks.push(
        <strong className="block font-extrabold text-gray-900 mt-2 first:mt-0" key={`h-${lineIndex}`}>
          {renderInline(heading[1], `h-${lineIndex}`)}
        </strong>,
      );
      return;
    }
    if (!line.trim()) {
      blocks.push(<span className="block h-2" key={`sp-${lineIndex}`} />);
      return;
    }
    blocks.push(
      <span className="block" key={`p-${lineIndex}`}>
        {renderInline(line, `p-${lineIndex}`)}
      </span>,
    );
  });

  flushList("list-end");
  return <>{blocks}</>;
}
