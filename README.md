# Source and Neighbour Check

Use this tool to see which sites are listed as neighbours of a source site and export those connections to Google Earth.

## 1. Prepare the two files

| File | Required columns | What to put in each row |
| --- | --- | --- |
| **All Sites** | Site ID, Latitude, Longitude | One site and its coordinates in decimal degrees. You can include extra columns such as Region or Technology. |
| **Neighbour Links** | Source Site, Neighbour Site | One direction per row, from the source to one listed neighbour. Add another row for each additional neighbour. |

CSV and Excel work for both files. Site IDs are case-sensitive. If an Excel site ID starts with a zero, save it as text so the zero is preserved.

Example **All Sites** CSV

```csv
Site ID,Latitude,Longitude,Region
YGN001,16.8500,96.1500,Yangon
YGN002,16.8700,96.1600,Yangon
YGN003,16.8300,96.1200,Yangon
```

Example **Neighbour Links** CSV

```csv
Source Site,Neighbour Site
YGN001,YGN002
YGN001,YGN003
```

In this example, selecting `YGN001` shows two outgoing neighbours. Add a row with `YGN002` as the source and `YGN001` as the neighbour if you also want the reverse link.

## 2. Upload and map the files

1. Open **File Input**. Click or drop a file into the **All Sites file** box and do the same for the **Neighbour Links file** box. Each box shows the loaded filename and row count. If a workbook has multiple worksheets, choose the sheet inside that box.
2. Open **Fields**. Under **All Sites columns**, confirm **Site ID**, **Latitude**, and **Longitude**. Under **Neighbour Links columns**, confirm **Source site** and **Neighbour site**.
3. Under **Popup Fields**, select the extra site attributes you want to see when clicking a marker.

## 3. Process and check the map

1. Open **Export** and select **Process**. The map displays the valid sites and updates the point count.
2. Click a marker or search by site ID. The selected source is **teal**, its listed neighbours are **red**, and other sites are **blue** by default. The detail panel lists the selected site's attributes and outgoing neighbours.
3. To view several sources, choose a column and value in the map toolbar. For example, choose **Site ID** and **YGN001** to show one source, or **Region** and **Yangon** to show all matching sources and their outgoing links. The toolbar shows the source, neighbour, and link counts. Choose **Any value** or **All columns** to clear the filter.
4. To zoom into a specific area, select **Box Zoom** at the far right of the toolbar and drag a rectangle over the map. Press **Esc** to cancel.

## 4. Export to Google Earth

To export a filtered group, leave the filter active. In **Export**, select **Export KMZ**, then open the downloaded file in Google Earth. A filtered KMZ includes the matching sources, their listed neighbours, and their connection lines, with the source and neighbour colours from **Style**.

## If the map is empty or a neighbour is missing

- If **Process** is disabled, check that both files are loaded and each required field in **Fields** has a separate column selected.
- If a site is missing, check that its site ID is filled in and its latitude and longitude are valid. When a site ID appears more than once, the tool keeps the first valid row.
- If a link is missing, confirm that both IDs exist in **All Sites** and that the link row lists the sites in the intended direction.
- After replacing a file, changing a worksheet, or changing a mapping, select **Process** again.
