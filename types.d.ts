import { CachedMetadata, Pos, TFile } from "obsidian";

declare module 'obsidian' {
    interface WorkspaceLeaf {
        containerEl: HTMLElement;
    }
    interface App {
        plugins: {
            getPlugin(id: string): Plugin | null;
        }
    }
    interface Plugin {
        settings: PluginSettingsObject;
    }
}

interface PluginSettingsObject {
    [settingName: string]: string | number | boolean;
}

interface PatchedCachedMetadata extends CachedMetadata {
    frontmatter?: PatchedFrontMatterCache;
}
type PatchedFrontMatterValues = string | number | boolean;
interface PatchedFrontMatterCache {
    position: Pos;
    [frontMatterKey: string]: PatchedFrontMatterValues | PatchedFrontMatterValues[] | null | Pos;
}

type YamlKeyValMap = {
    [frontMatterKey: string]: PatchedFrontMatterValues[];
}

interface RelatedYamlLinks {
    links: string[];
    yamlKeyValues: YamlKeyValMap | null;
}

interface MyPluginSettings extends PluginSettingsObject {
    autoSpace: boolean;
    secondaryTrigger: string;
    getAlias: boolean;
}

interface YamlFiles {
    theFile: TFile;
    mdCache: PatchedCachedMetadata;
    fmKeys: string[];
}
