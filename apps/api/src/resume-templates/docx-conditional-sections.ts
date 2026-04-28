type WrapResult = {
  xml: string;
  changed: boolean;
};

export function wrapOptionalDocxSections(xml: string): WrapResult {
  let next = xml;
  let changed = false;

  const certResult = wrapSection(next, {
    loopTag: "certificacoes",
    wrapperTag: "hasCertificacoes",
  });
  next = certResult.xml;
  changed = changed || certResult.changed;

  const langResult = wrapSection(next, {
    loopTag: "idiomas",
    wrapperTag: "hasIdiomas",
  });
  next = langResult.xml;
  changed = changed || langResult.changed;

  const goalResult = wrapSectionByField(next, {
    fieldTag: "mainGoal",
    wrapperTag: "hasMainGoal",
  });
  next = goalResult.xml;
  changed = changed || goalResult.changed;

  return { xml: next, changed };
}

function wrapSectionByField(
  xml: string,
  options: { fieldTag: string; wrapperTag: string },
): WrapResult {
  const { fieldTag, wrapperTag } = options;
  const fieldToken = `{${fieldTag}}`;
  const fieldIdx = xml.indexOf(fieldToken);
  if (fieldIdx < 0) return { xml, changed: false };

  const paragraphStartIdx = xml.lastIndexOf("<w:p", fieldIdx);
  const paragraphCloseIdx = xml.indexOf("</w:p>", fieldIdx);
  if (paragraphStartIdx < 0 || paragraphCloseIdx < 0) {
    return { xml, changed: false };
  }
  const paragraphEndIdx = paragraphCloseIdx + "</w:p>".length;
  const headingParagraphIdx = findHeadingParagraphStart(xml, paragraphStartIdx);
  const sectionStartIdx = headingParagraphIdx ?? paragraphStartIdx;

  const wrapperOpenTag = `{#${wrapperTag}}`;
  const wrapperCloseTag = `{/${wrapperTag}}`;
  const openWrapperIdx = xml.lastIndexOf(wrapperOpenTag, sectionStartIdx);
  const closeWrapperIdx = xml.indexOf(wrapperCloseTag, paragraphEndIdx);
  const alreadyWrapped =
    openWrapperIdx >= 0 &&
    closeWrapperIdx >= 0 &&
    openWrapperIdx < sectionStartIdx &&
    closeWrapperIdx > paragraphEndIdx;
  if (alreadyWrapped) return { xml, changed: false };

  const wrapped =
    xml.slice(0, sectionStartIdx) +
    tagParagraph(`#${wrapperTag}`) +
    xml.slice(sectionStartIdx, paragraphEndIdx) +
    tagParagraph(`/${wrapperTag}`) +
    xml.slice(paragraphEndIdx);

  return { xml: wrapped, changed: true };
}

function wrapSection(
  xml: string,
  options: { loopTag: string; wrapperTag: string },
): WrapResult {
  const { loopTag, wrapperTag } = options;

  const loopOpenTag = `{#${loopTag}}`;
  const loopCloseTag = `{/${loopTag}}`;
  const wrapperOpenTag = `{#${wrapperTag}}`;
  const wrapperCloseTag = `{/${wrapperTag}}`;

  const loopOpenIdx = xml.indexOf(loopOpenTag);
  const loopCloseIdx = xml.indexOf(loopCloseTag);
  if (loopOpenIdx < 0 || loopCloseIdx < loopOpenIdx) {
    return { xml, changed: false };
  }

  const loopStartParagraphIdx = xml.lastIndexOf("<w:p", loopOpenIdx);
  const loopEndParagraphCloseIdx = xml.indexOf("</w:p>", loopCloseIdx);
  if (loopStartParagraphIdx < 0 || loopEndParagraphCloseIdx < 0) {
    return { xml, changed: false };
  }

  const loopEndParagraphEndIdx = loopEndParagraphCloseIdx + "</w:p>".length;
  const headingParagraphIdx = findHeadingParagraphStart(
    xml,
    loopStartParagraphIdx,
  );
  const sectionStartIdx = headingParagraphIdx ?? loopStartParagraphIdx;

  const openWrapperIdx = xml.lastIndexOf(wrapperOpenTag, sectionStartIdx);
  const closeWrapperIdx = xml.indexOf(wrapperCloseTag, loopEndParagraphEndIdx);
  const alreadyWrapped =
    openWrapperIdx >= 0 &&
    closeWrapperIdx >= 0 &&
    openWrapperIdx < sectionStartIdx &&
    closeWrapperIdx > loopEndParagraphEndIdx;

  if (alreadyWrapped) {
    return { xml, changed: false };
  }

  const wrapped =
    xml.slice(0, sectionStartIdx) +
    tagParagraph(`#${wrapperTag}`) +
    xml.slice(sectionStartIdx, loopEndParagraphEndIdx) +
    tagParagraph(`/${wrapperTag}`) +
    xml.slice(loopEndParagraphEndIdx);

  return { xml: wrapped, changed: true };
}

function findHeadingParagraphStart(
  xml: string,
  beforeIndex: number,
): number | null {
  const paragraphRegex = /<w:p[\s\S]*?<\/w:p>/g;
  let match = paragraphRegex.exec(xml);
  let candidateStart: number | null = null;

  while (match && match.index < beforeIndex) {
    const paragraphXml = match[0];
    const text = getParagraphText(paragraphXml);

    if (text.length > 0 && !text.includes("{#") && !text.includes("{/")) {
      candidateStart = match.index;
    }

    match = paragraphRegex.exec(xml);
  }

  return candidateStart;
}

function getParagraphText(paragraphXml: string): string {
  return paragraphXml
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("\u00A0", " ")
    .trim();
}

function tagParagraph(tag: string): string {
  return `<w:p><w:r><w:t>{${tag}}</w:t></w:r></w:p>`;
}
