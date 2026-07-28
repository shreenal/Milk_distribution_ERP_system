const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync("docs.json", "utf8"));

const pages = [];

for (const tab of config.navigation.tabs) {
  for (const group of tab.groups) {
    for (const page of group.pages) {
      pages.push(page);
    }
  }
}

for (const page of pages) {
  const filePath = path.join(__dirname, `${page}.mdx`);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    const title = page
      .split("/")
      .pop()
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    fs.writeFileSync(
      filePath,
`---
title: ${title}
description: ${title} documentation
---

# ${title}

> This page is under construction.
`
    );

    console.log("Created:", page + ".mdx");
  }
}

console.log(`\nDone. ${pages.length} pages processed.`);