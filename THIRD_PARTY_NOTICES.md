# Third-party notices

WebDNA depends on the following directly declared packages (versions as installed for 0.1.0). All licenses are compatible with Apache-2.0. Transitive dependencies are listed in `package-lock.json`; run `npx license-checker --summary` (or an equivalent tool) for a full report.

| Package                            | Version | License      | Use                              |
| ---------------------------------- | ------- | ------------ | -------------------------------- |
| acorn                              | 8.19.0  | MIT          | JavaScript parsing (as data)     |
| css-select                         | 7.0.0   | BSD-2-Clause | Selector matching on static HTML |
| css-tree                           | 3.2.1   | MIT          | CSS parsing                      |
| domhandler                         | 6.0.1   | BSD-2-Clause | DOM for htmlparser2              |
| fastify                            | 5.12.7  | MIT          | API server                       |
| fflate                             | 0.8.3   | MIT          | ZIP export                       |
| htmlparser2                        | 12.0.0  | MIT          | HTML parsing                     |
| ipaddr.js                          | 2.5.0   | MIT          | IP range classification          |
| lucide-react                       | 1.64.0  | ISC          | Icons                            |
| next                               | 16.4.3  | MIT          | Web app                          |
| playwright                         | 1.64.1  | Apache-2.0   | Browser automation               |
| react / react-dom                  | 19.3.1  | MIT          | UI                               |
| tailwindcss / @tailwindcss/postcss | 4.3.3   | MIT          | Styling                          |
| zod                                | 4.6.7   | MIT          | Schemas                          |

Development only: typescript (Apache-2.0), vitest, tsx, esbuild, eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, prettier, concurrently, @types/* (all MIT).

## Optional native image libraries

Next.js declares `sharp` as an optional dependency. On install, npm downloads a platform-specific `@img/sharp-*` package whose bundled libvips binary is licensed **LGPL-3.0-or-later** (the JavaScript wrapper is Apache-2.0). These binaries are not stored in or distributed with this repository and WebDNA does not use Next.js image optimisation. If you redistribute a built WebDNA image that includes `node_modules`, include the libvips license and source offer as required by the LGPL.

All other transitive dependencies (391 packages in `package-lock.json` as of 0.1.0) are MIT, ISC, Apache-2.0, BSD-2/3-Clause, 0BSD, BlueOak-1.0.0, CC0-1.0, CC-BY-4.0 (data) or MPL-2.0 (file-level copyleft, used unmodified).

## Chromium

Playwright downloads a Chromium build at install time (`npx playwright install chromium`). It is not stored in this repository. Chromium is distributed under the BSD-3-Clause license and the licenses of its bundled components.

## Assets

No third-party fonts, icons files, images or website content are bundled. The UI uses system font stacks. Sample screenshots under `apps/web/public/sample/` and `docs/screenshots/` depict WebDNA itself and synthetic fixtures from this repository.
