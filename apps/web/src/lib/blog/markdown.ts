import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

type MarkdownSplitResult = {
  leadHtml: string | null;
  restHtml: string;
};

type MdastNode = {
  type: string;
};

type MdastRoot = {
  children: MdastNode[];
  type: "root";
};

const parser = unified().use(remarkParse).use(remarkGfm);
const htmlRenderer = unified().use(remarkRehype).use(rehypeStringify);

export async function markdownToHtml(markdown: string) {
  const tree = parser.parse(markdown);
  const hast = await htmlRenderer.run(tree);
  const result = htmlRenderer.stringify(hast);

  return String(result);
}

export async function splitMarkdownToLeadAndRest(
  markdown: string,
): Promise<MarkdownSplitResult> {
  const root = parser.parse(markdown) as MdastRoot;
  const leadIndex = root.children.findIndex(
    (node) => node.type === "paragraph",
  );

  if (leadIndex === -1) {
    return {
      leadHtml: null,
      restHtml: await markdownToHtml(markdown),
    };
  }

  const leadRoot: MdastRoot = {
    type: "root",
    children: [root.children[leadIndex]],
  };

  const restRoot: MdastRoot = {
    type: "root",
    children: root.children.filter((_, index) => index !== leadIndex),
  };

  const leadHast = await htmlRenderer.run(
    leadRoot as unknown as Parameters<typeof htmlRenderer.run>[0],
  );
  const restHast = await htmlRenderer.run(
    restRoot as unknown as Parameters<typeof htmlRenderer.run>[0],
  );

  return {
    leadHtml: String(htmlRenderer.stringify(leadHast)),
    restHtml: String(htmlRenderer.stringify(restHast)),
  };
}
