import { CachedMetadata, FrontMatterCache, LinkCache, Plugin_2, Pos, TFile } from "obsidian";

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

interface NldPlugin extends Plugin_2 {
    settings: {
        isAutosuggestEnabled: boolean;
        autocompleteTriggerPhrase: string;
    }
}

interface PluginSettingsObject {
    [settingName: string]: string | number | boolean | object;
}

interface MyPluginSettings extends PluginSettingsObject {
    saved: {
        settingsConfig: SettingsConfigSaved;
        data: SettingsDataSaved;
    };
    temp: {
        settingsConfig: SettingsConfigTemp;
        data: SettingsDataTemp;
    };
}

interface SettingsConfigSaved {
    autoSpace: boolean;
    secondaryTrigger: string;
    getAlias: boolean;
}

interface SettingsDataSaved {
    [property: string]: unknown;
}

interface SettingsConfigTemp {
    triggerChar: string;
    triggerCharSecondary: string;
    triggerCharAllLinks: string;
}

interface SettingsDataTemp {
    curMdCacheLinks: LinkCache[];
    fileLinks: string[];
    curYaml: FrontMatterCache | null;
    yamlLinks: string[];
    yamlKVPairs: YamlKeyValMap | null;
    vaultLinks: string[];
    linkMode: string;
    linkMatches: number;
    trigCharMatch: string;
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

interface YamlFiles {
    theFile: TFile;
    mdCache: PatchedCachedMetadata;
    fmKeys: string[];
}
