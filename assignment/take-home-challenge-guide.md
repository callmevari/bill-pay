# Submission Quality Guide

This document collects the practices that produce a strong take-home submission. It applies to this project and is intended as an internal reference while building.

## Reviewer Experience

The clearer the submission, the easier it is to evaluate. A submission with friction during setup, ambiguous behavior, or visible defects is more likely to be rejected, regardless of the work behind it. The bar is to leave the reviewer with no reason to say no.

## Requirement Alignment

The most common reason for rejection is a mismatch between the reviewer's expectations and the delivered scope. When requirements are open-ended, clarify them where possible and make sure both the technical and product requirements are satisfied in the final state.

## Time and Delivery

A practical target is to complete the work over a weekend or within seven business days. Submissions are rarely rejected for the amount of time spent; they are rejected for being late, incomplete, buggy, or rushed. It is better to invest more time and protect the result than to ship a half-finished project on schedule.

## Exceptional Submissions

Strong submissions are memorable. They demonstrate experience, taste, creativity, intuition, and resourcefulness.

Examples of what raises a submission above the baseline:

- Showing thoughtful judgment in a non-obvious technical or product decision.
- Going beyond the minimum scope where it improves the product.
- Solving a problem in a creative, well-reasoned way.
- Adding a small, well-chosen feature that improves user experience.

## Checklist

### Technology Stack

Choose a modern stack appropriate for the product. An outdated stack is read as outdated judgment. Pick widely adopted, current versions and document any non-obvious choices.

### Git History

Separate boilerplate from original contributions in the commit history. Group work into coherent chunks; avoid noisy commits like "fixed this" or "improved stuff". Use Conventional Commits with informative subjects.

### Easy to Run

If possible, deploy the project so it can be opened without installation. Otherwise, ensure local setup is a single, predictable path that works from a clean clone.

### Documentation

Setup and usage instructions are mandatory and must work from scratch. If the reviewer encounters a build or runtime error following the documentation, the submission can be rejected.

Include usage instructions and suggested workflows to validate the main paths. Reducing reviewer guesswork is critical.

Document the important technical decisions and their tradeoffs:

- Why this stack?
- Why this data model?
- Why this library over another?
- What tradeoffs were made?

### No Bugs

Any visible defect is reason enough for rejection. Verify the main workflows manually before declaring work done.

### Requirement Coverage

Both technical and product requirements must be satisfied. Re-read the requirements multiple times during the project and confirm coverage at the end.

### Delivery Speed

Delivery speed is a signal of capability. Avoid the temptation to stop early because the project "looks good enough". The strongest submissions invest the extra time to remove rough edges.

### Generative AI Usage

Do not leave AI-generated comments in the code. AI-flavored comments create a poor reviewer experience and raise concerns about authorship and code review discipline. AI tools may assist the process, but the final output must be reviewed, cleaned, and owned.

### Testing

Submissions with no evidence of testing may be penalized. Include at least one meaningful test for important business logic or a core workflow. Once the first test exists, more can be added incrementally.
