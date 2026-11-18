# Source and Neighbour Check

Map a file of site coordinates and a second file of directed source-to-neighbour links. File parsing, matching, and KMZ export run in the browser.

## Run locally

```sh
npm ci
npm run dev
```

## Deploy from GitHub

Commit the contents of this folder to the root of your GitHub repository. Keep the `src` directory structure and commit `package-lock.json` and `vercel.json`.

Connect that repository to a Vercel project. The included configuration selects Vite, runs `npm run build`, and serves `dist`. Use the repository root as the Vercel Root Directory. The application requires no environment variables.

## Use the tool

1. Upload the All Sites file and a CSV or Excel Neighbour Links file.
2. In **Fields**, confirm the site ID, latitude, longitude, source site, and neighbour site columns.
3. Open **Export** and select **Process**.
4. Click a site or filter by a column value. In a filtered view, teal marks the matching sources and red marks their listed neighbours. **Export KMZ** preserves those colours and connections.
5. To zoom to a rectangle, select **Box Zoom** at the right of the toolbar and drag over the map.
