type AtsScoreColors = {
  primary: string;
  projected: string;
};

export function getAtsScoreColors(score: number): AtsScoreColors {
  if (score <= 24) {
    return { primary: "#ff2d55", projected: "rgba(255,45,85,0.18)" };
  }

  if (score <= 44) {
    return { primary: "#ff7a00", projected: "rgba(255,122,0,0.18)" };
  }

  if (score <= 64) {
    return { primary: "#ffe600", projected: "rgba(255,230,0,0.18)" };
  }

  if (score <= 84) {
    return { primary: "#78ff1f", projected: "rgba(120,255,31,0.18)" };
  }

  return { primary: "#39ff14", projected: "rgba(57,255,20,0.18)" };
}
