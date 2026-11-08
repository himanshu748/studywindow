# Cambridge PACE source suitability

Checked November 3, 2026. Supported source: https://www.pace.cam.ac.uk/course-search and its canonical course pages.

The public catalogue exposes keyword search, study-mode filters, result counts and numbered pagination. Its visible GET form uses `search_api_fulltext`, `field_subject_categories`, `field_course_type`, `field_method` and `page`; these are website form parameters, not a documented public course API. Catalogue rows may represent multiple dated offerings sharing one course page.

Targeted primary-domain searches for `site:pace.cam.ac.uk "API"`, `"pace.cam.ac.uk" "public API"`, and `"pace.cam.ac.uk" "jsonapi"`, plus catalogue and official navigation inspection, found no documented public course API supplying the required information. **This is bounded negative evidence, not proof that no public or undocumented API exists. The site owner and bounty organizer have not confirmed API absence.** Oxford was not used.

The browser-read https://www.pace.cam.ac.uk/robots.txt does not disallow `/course-search` or `/courses/`. Its restrictions on the distinct generic `/search` paths were respected. The observed file is in robots-observed.txt. Robots access is not a licence to republish course materials.

The official general terms at https://www.pace.cam.ac.uk/policies-and-reports/general-terms-and-conditions govern course booking and provision. No express public-catalogue automation prohibition was found there during this bounded inspection. StudyWindow does not log in to Cambridge, apply, book, download course materials, or change the site.

Direct requests from the development environment returned 403. TinyFish Fetch successfully retrieved the public catalogue and course landing pages. TinyFish Agent searches worked for psychology and history pagination. Some direct course-navigation runs produced ERR_EMPTY_RESPONSE; those failures are retained and never substituted with fixtures. Normal catalogue navigation was then tested. See VERIFICATION.md for the final live outcome and supported limitations.

Primary sources:
- https://www.pace.cam.ac.uk/course-search
- https://www.pace.cam.ac.uk/robots.txt
- https://www.pace.cam.ac.uk/policies-and-reports/general-terms-and-conditions
- https://docs.tinyfish.ai/agent/api/agent/
- https://docs.tinyfish.ai/fetch-api/reference
