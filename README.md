![GitHub latest release](https://img.shields.io/github/v/release/GitMurf/obsidian-page-link-autocomplete?style=for-the-badge&sort=semver)
![GitHub All Releases](https://img.shields.io/github/downloads/GitMurf/obsidian-page-link-autocomplete/total?style=for-the-badge)

## SAMPLE plugin Overview

This is a plugin for Obsidian (https://obsidian.md).

Quick rought explanation... a page suggestion / auto complete for [[linking]].

- It activates on entering a space and looks at the previous word and only suggests things if the previous word is 4 characters or more (to avoid showing suggestions on small article words etc.)
- By default it suggests from a list of all links on your current page for easy re-linking as you type the same terms multiple times on a page
- By default it also looks at your YAML frontmatter for the page and then finds all pages that have similar yaml (a matching key:value pair) and pulling links from those pages... for me this is relevant for meeting notes with clients so that I can quickly link to common [[pages]] like contacts or departments or [[topics]] for a particular client.
- You can expand your autocomplete search/match to ALL links in your vault by adding a "," comma after the space. So if you type "client " and it only gives you a result for [[client abc]] but really you are looking for [[client xyz]] then simply add a "," comma and it will expand the results: "client ," then shows [[client abc]], [[client def]], [[client xyz]], [[good client]], [[desktop client]] etc.

## Demo

https://user-images.githubusercontent.com/64155612/145903481-eb6793aa-0de8-4b3a-88cd-5a87c227e24a.mp4

## Features

- Feature 1
- Feature 2
- Feature 3

## Details

Need to add some details and use cases here

## General Obsidian Documentation

### Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

### API Documentation

See https://github.com/obsidianmd/obsidian-api
