// @ts-nocheck
import { Fragment, createElement } from "react";

interface Node {
  type: string;
  text?: string;
  children?: Node[];
  tag?: string;
  level?: number;
}

function tokenize(src: string): Node[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const root: Node = { type: "root", children: [] };
  const stack: Node[] = [root];
  let listStack: Node[] = [];

  function push(node: Node) {
    const top = stack[stack.length - 1];
    (top.children ??= []).push(node);
  }

  for (let raw of lines) {
    if (raw.trim() === "") { listStack = []; continue; }
    if (/^>\s?/.test(raw)) {
      push({ type: "blockquote", children: inline(raw.replace(/^>\s?/, "")) });
      continue;
    }
    const h = raw.match(/^(#{1,3})\s+(.*)$/);
    if (h) { listStack = []; push({ type: "heading", level: h[1].length, children: inline(h[2]) }); continue; }
    const ul = raw.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (listStack.length === 0) { const n: Node = { type: "ul", children: [] }; push(n); listStack = [n]; }
      (listStack[0].children ??= []).push({ type: "li", children: inline(ul[1]) });
      continue;
    }
    const ol = raw.match(/^(\d+)[.)]\s+(.*)$/);
    if (ol) {
      if (listStack.length === 0 || listStack[0].type !== "ol") { const n: Node = { type: "ol", children: [] }; push(n); listStack = [n]; }
      (listStack[0].children ??= []).push({ type: "li", children: inline(ol[2]) });
      continue;
    }
    push({ type: "paragraph", children: inline(raw) });
  }
  return root.children ?? [];
}

function inline(text: string): Node[] {
  const out: Node[] = [];
  let i = 0, buf = "";
  const flush = () => { if (buf) { out.push({ type: "text", text: buf }); buf = ""; } };
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest.startsWith("**") && rest.indexOf("**", 2) > 0) {
      const end = rest.indexOf("**", 2); flush();
      out.push({ type: "strong", children: inline(rest.slice(2, end)) }); i += end + 2; continue;
    }
    if (rest.startsWith("*") && !/^\d+\*/.test(rest) && rest.indexOf("*", 1) > 0) {
      const end = rest.indexOf("*", 1); flush();
      out.push({ type: "em", children: inline(rest.slice(1, end)) }); i += end + 1; continue;
    }
    if (rest.startsWith("`") && rest.indexOf("`", 1) > 0) {
      const end = rest.indexOf("`", 1); flush();
      out.push({ type: "code", text: rest.slice(1, end) }); i += end + 1; continue;
    }
    buf += rest[0]; i += 1;
  }
  flush();
  return out;
}

function renderInline(nodes: Node[]): React.ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "strong": return <strong key={i}>{renderInline(n.children ?? [])}</strong>;
      case "em": return <em key={i}>{renderInline(n.children ?? [])}</em>;
      case "code": return <code key={i} className="bg-gray-100 px-1 rounded text-[12px]">{n.text}</code>;
      default: return <Fragment key={i}>{n.text}</Fragment>;
    }
  });
}

function renderBlocks(nodes: Node[], acc: React.ReactNode[] = []): React.ReactNode[] {
  for (const n of nodes) {
    switch (n.type) {
      case "paragraph": acc.push(<p key={acc.length} className="mb-2">{renderInline(n.children ?? [])}</p>); break;
      case "blockquote": acc.push(<blockquote key={acc.length} className="border-l-2 border-gray-300 pl-3 italic text-gray-600">{renderInline(n.children ?? [])}</blockquote>); break;
      case "heading": acc.push(createElement(`h${n.level ?? 2}` as "h2", { key: acc.length, className: "font-semibold mt-3 mb-1" }, renderInline(n.children ?? []))); break;
      case "ul": acc.push(<ul key={acc.length} className="list-disc pl-6 mb-2">{(n.children ?? []).map((li, i) => <li key={i}>{renderInline(li.children ?? [])}</li>)}</ul>); break;
      case "ol": acc.push(<ol key={acc.length} className="list-decimal pl-6 mb-2">{(n.children ?? []).map((li, i) => <li key={i}>{renderInline(li.children ?? [])}</li>)}</ol>); break;
    }
  }
  return acc;
}

export function Markdown({ source }: { source: string }) {
  return <div className="prose-sm">{renderBlocks(tokenize(source))}</div>;
}
