# EarlyCV English Hash Fixtures

English smoke-test fixtures for validating `rawJobHash`, `canonicalJobHash`, and `requirementSourceHash`.

## How to use

For each folder:

1. Calculate `rawJobHash` from the `.txt` files.
2. Calculate `canonicalJobHash` after running the real LLM canonicalizer.
3. Calculate `requirementSourceHash` from the canonical description only.
4. Compare the observed results with `expected.json`.

## Meaning

- `rawHash: MATCH`: files should produce the same rawJobHash.
- `rawHash: DIFFERENT`: files should produce different rawJobHash.
- `canonicalHash: MATCH`: files should produce the same canonicalJobHash.
- `canonicalHash: DIFFERENT`: files should produce different canonicalJobHash.
- `requirementSourceHash: MATCH`: files should produce the same requirementSourceHash.
- `requirementSourceHash: DIFFERENT`: files should produce different requirementSourceHash.

## Cases

1. `01_rawhash_match`
   - Same content with casing/spacing differences.
   - rawHash, canonicalHash and requirementSourceHash should match.

2. `02_canonicalhash_match_linkedin_noise`
   - Same job with LinkedIn/interface noise.
   - rawHash should differ, canonicalHash and requirementSourceHash should match.

3. `03_canonicalhash_match_greenhouse_noise`
   - Same job with common ATS/careers-site noise.
   - rawHash should differ, canonicalHash and requirementSourceHash should match.

4. `04_both_fail_different_role`
   - Actually different roles.
   - All hashes should differ.

5. `05_both_fail_same_title_different_requirements`
   - Same title and company, but different tech stack/requirements.
   - All hashes should differ.

6. `06_canonicalhash_should_not_match_if_seniority_changes`
   - Similar role family, different seniority.
   - All hashes should differ.

7. `07_requirement_match_different_company_title`
   - Different company/title metadata, same cleaned description.
   - canonicalHash should differ, requirementSourceHash should match.

## Important

The canonicalizer must not summarize the job.
It should remove platform/interface noise and preserve all useful responsibilities, requirements and qualifications.

Common English noise lines to remove:
- Apply
- Apply now
- Save
- Share
- Copy link
- Report this job
- Link copied
- Privacy policy
- About the job
- Job description
- What you will do
- What we are looking for
- Responsibilities
- Requirements
- Qualifications
- Additional information
- Hiring process
- Equal opportunity employer statement
- Show more options
- See how you compare
- Reposted
- Promoted by recruiter

For section headers, remove the header line, not the useful bullet content below it.
