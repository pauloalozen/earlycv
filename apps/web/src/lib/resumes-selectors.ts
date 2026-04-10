export type ResumeDto = {
  id: string;
  title: string;
  sourceFileName: string | null;
  isMaster: boolean;
  updatedAt: string;
};

export function getMasterResumeFromList(
  resumes: ResumeDto[],
): ResumeDto | null {
  return resumes.find((resume) => resume.isMaster) ?? null;
}
