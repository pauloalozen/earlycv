// Ordem padrão do /radar: evita que uma empresa que publicou dezenas de
// vagas de uma vez tome a página inteira. Mantém a ordem original (data ou
// score) o máximo possível, só adiando a vaga que seria a (max+1)-ésima da
// mesma empresa em sequência até aparecer uma de outra empresa. Quando só
// sobram vagas da mesma empresa, elas seguem em sequência normalmente.
//
// Determinística (mesma entrada, mesma saída) — a paginação depende disso:
// a ordem é calculada sobre o conjunto filtrado inteiro e só depois fatiada.
export const MAX_CONSECUTIVE_SAME_COMPANY = 2;

export function diversifyByCompany<T>(
  items: readonly T[],
  getCompany: (item: T) => string,
  maxConsecutive = MAX_CONSECUTIVE_SAME_COMPANY,
): T[] {
  const taken = new Array<boolean>(items.length).fill(false);
  const result: T[] = [];
  let first = 0; // primeiro índice ainda não usado
  let streakCompany: string | null = null;
  let streak = 0;
  // Depois que uma busca não acha outra empresa, tudo que sobrou é da
  // empresa da sequência — evita varrer o resto da lista a cada item.
  let onlyStreakCompanyLeft = false;

  while (result.length < items.length) {
    while (taken[first]) first += 1;

    let pick = first;
    if (streak >= maxConsecutive && !onlyStreakCompanyLeft) {
      // A mais bem colocada que não seja da empresa da sequência atual.
      let i = first;
      while (
        i < items.length &&
        (taken[i] || getCompany(items[i] as T) === streakCompany)
      ) {
        i += 1;
      }
      if (i < items.length) pick = i;
      else onlyStreakCompanyLeft = true;
    }

    taken[pick] = true;
    const item = items[pick] as T;
    result.push(item);
    const company = getCompany(item);
    if (company === streakCompany) {
      streak += 1;
    } else {
      streakCompany = company;
      streak = 1;
    }
  }

  return result;
}
