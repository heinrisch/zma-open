// Asset type enum - covers all supported services

enum AssetType {
  // Google services
  GDocs = 'gdocs',
  GSheets = 'gsheets',
  GSlides = 'gslides',
  GDrive = 'gdrive',
  GForms = 'gforms',
  GChat = 'gchat',

  // Atlassian services
  Confluence = 'confluence',
  Jira = 'jira',
  Bitbucket = 'bitbucket',
  TrelloBoard = 'trello_board',
  TrelloCard = 'trello_card',
  Statuspage = 'statuspage',

  // Miro
  MiroBoard = 'miro_board',
  MiroEmbed = 'miro_embed',

  // Unclassified
  Unclassified = 'unclassified'
}

enum Platform {
  Google = 'google',
  Atlassian = 'atlassian',
  Miro = 'miro',
  Unknown = 'unknown'
}

// Color mapping for asset types
const AssetTypeColors: Record<AssetType, string> = {
  // Google services - Google blue and related colors
  [AssetType.GDocs]: '#4285F4', // Google blue
  [AssetType.GSheets]: '#34A853', // Google green
  [AssetType.GSlides]: '#FBBC04', // Google yellow
  [AssetType.GDrive]: '#1F71B8', // Google drive blue
  [AssetType.GForms]: '#7B68EE', // Medium purple
  [AssetType.GChat]: '#00BCD4', // Cyan (Google Chat color)

  // Atlassian services - Blue tones
  [AssetType.Confluence]: '#172B4D', // Atlassian navy
  [AssetType.Jira]: '#0052CC', // Jira blue
  [AssetType.Bitbucket]: '#0052CC', // Bitbucket blue
  [AssetType.TrelloBoard]: '#0079BF', // Trello blue
  [AssetType.TrelloCard]: '#0079BF', // Trello blue
  [AssetType.Statuspage]: '#FF6B6B', // Statuspage red

  // Miro - Orange tones
  [AssetType.MiroBoard]: '#FFB81C', // Miro orange
  [AssetType.MiroEmbed]: '#FFB81C', // Miro orange

  // Unclassified - Gray
  [AssetType.Unclassified]: '#d97706' // Gray
};

interface URLClassification {
  normalizedUrl: string | null;
  fullUrl: string;
  assetType: AssetType;
  platform: Platform;
  documentId: string | null;
  relevantParams?: Record<string, string>;
  metadata?: Record<string, any>;
  isClassified: boolean;
  color: string;
}

interface URLPattern {
  domain: RegExp;
  pathPattern: RegExp;
  assetType: AssetType;
  platform: Platform;
  extractId: (url: URL) => string | null;
  buildNormalizedUrl: (id: string, metadata?: any) => string;
  extractMetadata?: (url: URL) => Record<string, any>;
}

class URLClassifier {
  private patterns: URLPattern[] = [
    // Google Services

    {
      domain: /^docs\.google\.com$/,
      pathPattern: /^\/document\/(u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/,
      assetType: AssetType.GDocs,
      platform: Platform.Google,
      extractId: (url) => {
        const match = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://docs.google.com/document/d/${id}/edit`,
      extractMetadata: (url) => {
        const metadata: Record<string, any> = {};
        const accountMatch = url.pathname.match(/\/u\/(\d+)\//);
        if (accountMatch) metadata.account = parseInt(accountMatch[1]);
        if (url.pathname.includes('/preview')) metadata.mode = 'preview';
        else if (url.pathname.includes('/edit')) metadata.mode = 'edit';
        return metadata;
      }
    },

    {
      domain: /^docs\.google\.com$/,
      pathPattern: /^\/spreadsheets\/(u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/,
      assetType: AssetType.GSheets,
      platform: Platform.Google,
      extractId: (url) => {
        const match = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`,
      extractMetadata: (url) => {
        const metadata: Record<string, any> = {};
        const accountMatch = url.pathname.match(/\/u\/(\d+)\//);
        if (accountMatch) metadata.account = parseInt(accountMatch[1]);
        const gidMatch = url.hash.match(/gid=(\d+)/);
        if (gidMatch) metadata.sheetId = gidMatch[1];
        return metadata;
      }
    },

    {
      domain: /^docs\.google\.com$/,
      pathPattern: /^\/presentation\/(u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/,
      assetType: AssetType.GSlides,
      platform: Platform.Google,
      extractId: (url) => {
        const match = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://docs.google.com/presentation/d/${id}/edit`,
      extractMetadata: (url) => {
        const metadata: Record<string, any> = {};
        const accountMatch = url.pathname.match(/\/u\/(\d+)\//);
        if (accountMatch) metadata.account = parseInt(accountMatch[1]);
        const slideMatch = url.hash.match(/slide=id\.([a-zA-Z0-9-_]+)/);
        if (slideMatch) metadata.slideId = slideMatch[1];
        return metadata;
      }
    },

    {
      domain: /^drive\.google\.com$/,
      pathPattern: /^\/file\/d\/([a-zA-Z0-9-_]+)/,
      assetType: AssetType.GDrive,
      platform: Platform.Google,
      extractId: (url) => {
        const match = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://drive.google.com/file/d/${id}/view`
    },

    {
      domain: /^forms\.gle$/,
      pathPattern: /^\/([a-zA-Z0-9-_]+)$/,
      assetType: AssetType.GForms,
      platform: Platform.Google,
      extractId: (url) => {
        const match = url.pathname.match(/^\/([a-zA-Z0-9-_]+)$/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://forms.gle/${id}`
    },

    {
      domain: /^docs\.google\.com$/,
      pathPattern: /^\/forms\/d\/([a-zA-Z0-9-_]+)/,
      assetType: AssetType.GForms,
      platform: Platform.Google,
      extractId: (url) => {
        const match = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://docs.google.com/forms/d/${id}/viewform`
    },

    // Google Chat - supports multiple URL formats
    {
      domain: /^chat\.google\.com$/,
      pathPattern: /^\/u\/\d+\/a\/([a-zA-Z0-9]+)/,
      assetType: AssetType.GChat,
      platform: Platform.Google,
      extractId: (url) => {
        const match = url.pathname.match(/\/a\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id, metadata) => {
        const userIndex = metadata?.userIndex || 0;
        return `https://chat.google.com/u/${userIndex}/a/${id}`;
      },
      extractMetadata: (url) => {
        const metadata: Record<string, any> = {};
        const userMatch = url.pathname.match(/\/u\/(\d+)\//);
        if (userMatch) metadata.userIndex = parseInt(userMatch[1]);
        return metadata;
      }
    },

    {
      domain: /^groups\.google\.com$/,
      pathPattern: /^\/a\/[^\/]+\/d\/([a-zA-Z0-9-]+)/,
      assetType: AssetType.GChat,
      platform: Platform.Google,
      extractId: (url) => {
        const match = url.pathname.match(/\/d\/([a-zA-Z0-9-]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id, metadata) => {
        const group = metadata?.group || 'group';
        return `https://groups.google.com/a/${group}/d/${id}`;
      },
      extractMetadata: (url) => {
        const metadata: Record<string, any> = {};
        const groupMatch = url.pathname.match(/\/a\/([^\/]+)\//);
        if (groupMatch) metadata.group = groupMatch[1];
        return metadata;
      }
    },

    // Atlassian services

    {
      domain: /\.atlassian\.net$/,
      pathPattern: /^\/wiki\/(spaces\/[^\/]+\/pages\/\d+|display\/[^\/]+)/,
      assetType: AssetType.Confluence,
      platform: Platform.Atlassian,
      extractId: (url) => {
        const pageMatch = url.pathname.match(/\/pages\/(\d+)/);
        if (pageMatch) return `page-${pageMatch[1]}`;
        const displayMatch = url.pathname.match(/\/display\/(.+)/);
        if (displayMatch) return `display-${displayMatch[1]}`;
        return null;
      },
      buildNormalizedUrl: (id, metadata) => {
        const baseUrl = metadata?.baseUrl || 'https://company.atlassian.net';
        if (id.startsWith('page-')) {
          const pageId = id.replace('page-', '');
          return `${baseUrl}/wiki/spaces/${metadata?.spaceKey || 'SPACE'}/pages/${pageId}`;
        }
        return `${baseUrl}/wiki/display/${id.replace('display-', '')}`;
      },
      extractMetadata: (url) => {
        const metadata: Record<string, any> = {
          baseUrl: `${url.protocol}//${url.hostname}`
        };
        const spaceMatch = url.pathname.match(/\/spaces\/([^\/]+)/);
        if (spaceMatch) metadata.spaceKey = spaceMatch[1];
        return metadata;
      }
    },

    {
      domain: /\.atlassian\.net$/,
      pathPattern: /^\/browse\/([A-Z]+-\d+)/,
      assetType: AssetType.Jira,
      platform: Platform.Atlassian,
      extractId: (url) => {
        const match = url.pathname.match(/\/browse\/([A-Z]+-\d+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id, metadata) => {
        const baseUrl = metadata?.baseUrl || 'https://company.atlassian.net';
        return `${baseUrl}/browse/${id}`;
      },
      extractMetadata: (url) => ({
        baseUrl: `${url.protocol}//${url.hostname}`
      })
    },

    {
      domain: /^bitbucket\.org$/,
      pathPattern: /^\/([^\/]+)\/([^\/]+)/,
      assetType: AssetType.Bitbucket,
      platform: Platform.Atlassian,
      extractId: (url) => {
        const match = url.pathname.match(/^\/([^\/]+)\/([^\/]+)/);
        return match ? `${match[1]}/${match[2]}` : null;
      },
      buildNormalizedUrl: (id) => `https://bitbucket.org/${id}`,
      extractMetadata: (url) => {
        const metadata: Record<string, any> = {};
        const pathParts = url.pathname.split('/').filter(p => p);
        if (pathParts.length >= 2) {
          metadata.workspace = pathParts[0];
          metadata.repository = pathParts[1];
        }
        const branch = url.searchParams.get('at');
        if (branch) metadata.branch = branch;
        return metadata;
      }
    },

    {
      domain: /^trello\.com$/,
      pathPattern: /^\/b\/([a-zA-Z0-9]+)/,
      assetType: AssetType.TrelloBoard,
      platform: Platform.Atlassian,
      extractId: (url) => {
        const match = url.pathname.match(/^\/b\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://trello.com/b/${id}`
    },

    {
      domain: /^trello\.com$/,
      pathPattern: /^\/c\/([a-zA-Z0-9]+)/,
      assetType: AssetType.TrelloCard,
      platform: Platform.Atlassian,
      extractId: (url) => {
        const match = url.pathname.match(/^\/c\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://trello.com/c/${id}`
    },

    {
      domain: /\.statuspage\.io$/,
      pathPattern: /^\/?(.*)?$/,
      assetType: AssetType.Statuspage,
      platform: Platform.Atlassian,
      extractId: (url) => {
        const subdomain = url.hostname.split('.')[0];
        return subdomain !== 'www' ? subdomain : null;
      },
      buildNormalizedUrl: (id) => `https://${id}.statuspage.io/`
    },

    // Miro

    {
      domain: /^miro\.com$/,
      pathPattern: /^\/app\/board\/([a-zA-Z0-9_=-]+)/,
      assetType: AssetType.MiroBoard,
      platform: Platform.Miro,
      extractId: (url) => {
        const match = url.pathname.match(/^\/app\/board\/([a-zA-Z0-9_=-]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://miro.com/app/board/${id}/`,
      extractMetadata: (url) => {
        const metadata: Record<string, any> = {};
        const viewport = url.searchParams.get('moveToViewport');
        if (viewport) metadata.viewport = viewport;
        const fromEmbed = url.searchParams.get('fromEmbed');
        if (fromEmbed) metadata.embedded = fromEmbed === '1';
        return metadata;
      }
    },

    {
      domain: /^miro\.com$/,
      pathPattern: /^\/app\/live-embed\/([a-zA-Z0-9_=-]+)/,
      assetType: AssetType.MiroEmbed,
      platform: Platform.Miro,
      extractId: (url) => {
        const match = url.pathname.match(/^\/app\/live-embed\/([a-zA-Z0-9_=-]+)/);
        return match ? match[1] : null;
      },
      buildNormalizedUrl: (id) => `https://miro.com/app/board/${id}/`
    }
  ];

  private trackingParams = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'gclid', 'gclsrc', '_ga', 'campaign_id',
    'fbclid', 'igsh', 'si',
    'msclkid',
    'mc_cid', 'mc_eid',
    'pk_campaign', 'pk_kwd', 'pk_content', 'mtm_campaign', 'mtm_keyword',
    'matomo_campaign',
    'ref', 'referrer', 'affiliate_id',
    'hsa_cam', 'hsa_grp', 'hsa_mt', 'hsa_src', 'hsa_ad', 'hsa_acc', 'hsa_net', 'hsa_kw',
    'trk', 'trkInfo',
    'epik', 'WT.mc_id', 'WT.nav', 'wprov', '__s', '_branch_match_id',
    'usp', 'authuser', 'ved', 'ei', 'uact',
    'sharing', 'drive_web', 'embedded'
  ]);

  private removeTrackingParams(url: URL): Record<string, string> {
    const relevantParams: Record<string, string> = {};
    const paramsToRemove: string[] = [];

    for (const [key, value] of url.searchParams.entries()) {
      if (this.trackingParams.has(key) || key.startsWith('utm_') || key.startsWith('hsa_')) {
        paramsToRemove.push(key);
      } else {
        relevantParams[key] = value;
      }
    }

    paramsToRemove.forEach(param => url.searchParams.delete(param));
    return relevantParams;
  }

  classify(urlString: string): URLClassification {
    try {
      const url = new URL(urlString);
      const relevantParams = this.removeTrackingParams(url);

      const pattern = this.patterns.find(p =>
        p.domain.test(url.hostname) && p.pathPattern.test(url.pathname)
      );

      if (!pattern) {
        // Return unclassified link
        return this.createUnclassifiedResult(urlString, url, relevantParams);
      }

      const documentId = pattern.extractId(url);
      if (!documentId) {
        // Pattern matched but couldn't extract ID - treat as unclassified
        return this.createUnclassifiedResult(urlString, url, relevantParams);
      }

      const metadata = pattern.extractMetadata ? pattern.extractMetadata(url) : {};
      const normalizedUrl = pattern.buildNormalizedUrl(documentId, metadata);

      return {
        normalizedUrl,
        fullUrl: urlString,
        assetType: pattern.assetType,
        platform: pattern.platform,
        documentId,
        relevantParams: Object.keys(relevantParams).length > 0 ? relevantParams : undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        isClassified: true,
        color: AssetTypeColors[pattern.assetType]
      };
    } catch (error) {
      // Silently handle any parsing errors and return unclassified
      return this.createUnclassifiedResult(urlString, null, {});
    }
  }

  private createUnclassifiedResult(
    urlString: string,
    url: URL | null,
    relevantParams: Record<string, string>
  ): URLClassification {
    return {
      normalizedUrl: null,
      fullUrl: urlString,
      assetType: AssetType.Unclassified,
      platform: Platform.Unknown,
      documentId: null,
      relevantParams: Object.keys(relevantParams).length > 0 ? relevantParams : undefined,
      metadata: url ? {
        hostname: url.hostname,
        pathname: url.pathname
      } : undefined,
      isClassified: false,
      color: AssetTypeColors[AssetType.Unclassified]
    };
  }

  isSameAsset(url1: string, url2: string): boolean {
    const classification1 = this.classify(url1);
    const classification2 = this.classify(url2);

    // For unclassified links, compare full URLs
    if (!classification1.isClassified || !classification2.isClassified) {
      return classification1.fullUrl === classification2.fullUrl;
    }

    return (
      classification1.assetType === classification2.assetType &&
      classification1.documentId === classification2.documentId
    );
  }

  getUrlVariations(urlString: string): string[] {
    const classification = this.classify(urlString);
    
    // Don't generate variations for unclassified links
    if (!classification.isClassified || !classification.normalizedUrl) {
      return [classification.fullUrl];
    }

    const variations = [classification.normalizedUrl];
    const docId = classification.documentId;

    switch (classification.assetType) {
      case AssetType.GDocs:
        variations.push(
          `https://docs.google.com/document/d/${docId}/preview`,
          `https://docs.google.com/document/u/0/d/${docId}/edit`,
          `https://docs.google.com/document/u/1/d/${docId}/edit`
        );
        break;

      case AssetType.GSheets:
        variations.push(
          `https://docs.google.com/spreadsheets/u/0/d/${docId}/edit`,
          `https://docs.google.com/spreadsheets/u/1/d/${docId}/edit`
        );
        break;

      case AssetType.GSlides:
        variations.push(
          `https://docs.google.com/presentation/d/${docId}/present`,
          `https://docs.google.com/presentation/u/0/d/${docId}/edit`,
          `https://docs.google.com/presentation/u/1/d/${docId}/edit`
        );
        break;

      case AssetType.GChat:
        variations.push(
          `https://chat.google.com/u/0/a/${docId}`,
          `https://chat.google.com/u/1/a/${docId}`
        );
        break;
    }

    return [...new Set(variations)];
  }

  static getAssetColor(assetType: AssetType): string {
    return AssetTypeColors[assetType];
  }
}

export { URLClassifier, URLClassification, AssetType, Platform, AssetTypeColors };