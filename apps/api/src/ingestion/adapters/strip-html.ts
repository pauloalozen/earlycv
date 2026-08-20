import { decodeHtmlEntities } from "../name-normalization";

const ESCAPED_TAG_PATTERN =
  /&lt;\/?(?:p|div|span|strong|em|b|i|u|ul|ol|li|br|h[1-6]|a)\b/i;

// Alguns boards (achado em Greenhouse, ex: BTG Pactual) devolvem o campo de
// descricao com as tags HTML ja escapadas como entidades (ex:
// "&lt;p&gt;...&lt;/p&gt;") em vez do HTML de verdade — normalmente porque
// quem cadastrou a vaga colou HTML ja escapado dentro do editor rich-text
// da fonte. Sem isso, o front injeta esse texto via dangerouslySetInnerHTML
// esperando HTML de verdade e o usuario ve a marcacao crua na tela em vez
// do texto formatado. Deteccao: a string nao tem nenhuma tag real (sem "<"
// solto) mas tem alguma tag conhecida na forma escapada — decodificar as
// entidades uma vez recupera o HTML valido. Quando o conteudo ja vem com
// tags reais (caso comum), a funcao nao mexe em nada.
export function normalizeDescriptionHtml(value: string): string {
  if (!value || value.includes("<")) return value;
  if (!ESCAPED_TAG_PATTERN.test(value)) return value;
  return decodeHtmlEntities(value);
}

// Compartilhado entre GreenhouseAdapter, LeverAdapter e TeamtailorAdapter —
// os tres tinham essa mesma funcao duplicada pra converter a descricao em
// HTML (unica fonte disponivel nesses boards) em texto plano legivel.
export function stripHtml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
