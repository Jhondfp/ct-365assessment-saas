const { Client } = require('@microsoft/microsoft-graph-client');
const { DefaultAzureCredential, ClientSecretCredential } = require('@azure/identity');
const logger = require('../config/logger');
const config = require('../config');

class SharePointService {
  constructor() {
    this.client = null;
  }

  async initializeClient(tenantId, accessToken) {
    try {
      this.client = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        }
      });
      logger.info(`SharePoint client initialized for tenant: ${tenantId}`);
    } catch (error) {
      logger.error(`Failed to initialize SharePoint client: ${error.message}`);
      throw error;
    }
  }

  async getAccessToken(tenantId, appId, appSecret) {
    try {
      // Opção 1: Usando Managed Identity (Azure)
      if (process.env.AZURE_MANAGED_IDENTITY === 'true') {
        const credential = new DefaultAzureCredential();
        const token = await credential.getToken(
          'https://graph.microsoft.com/.default'
        );
        return token.token;
      }

      // Opção 2: Usando Client Credentials (desenvolvimento local)
      if (appId && appSecret) {
        const credential = new ClientSecretCredential(
          tenantId,
          appId,
          appSecret
        );
        const token = await credential.getToken(
          'https://graph.microsoft.com/.default'
        );
        return token.token;
      }

      throw new Error('No authentication method available');
    } catch (error) {
      logger.error(`Failed to get access token: ${error.message}`);
      throw error;
    }
  }

  // ======================================
  // SHAREPOINT SITES
  // ======================================

  async listSites() {
    try {
      const response = await this.client
        .api('/sites?$select=id,displayName,webUrl,siteCollection')
        .get();

      logger.info(`Found ${response.value.length} SharePoint sites`);
      return response.value;
    } catch (error) {
      logger.error(`Error listing SharePoint sites: ${error.message}`);
      throw error;
    }
  }

  async getSiteDetails(siteId) {
    try {
      const site = await this.client
        .api(`/sites/${siteId}?$select=id,displayName,webUrl,createdDateTime`)
        .get();

      return site;
    } catch (error) {
      logger.error(`Error getting site details: ${error.message}`);
      throw error;
    }
  }

  // ======================================
  // SHAREPOINT LIBRARIES & LISTS
  // ======================================

  async listDrives(siteId) {
    try {
      const response = await this.client
        .api(`/sites/${siteId}/drives?$select=id,name,webUrl`)
        .get();

      logger.info(`Found ${response.value.length} drives in site ${siteId}`);
      return response.value;
    } catch (error) {
      logger.error(`Error listing drives: ${error.message}`);
      throw error;
    }
  }

  async getDriveStats(siteId, driveId) {
    try {
      const response = await this.client
        .api(`/sites/${siteId}/drives/${driveId}/root`)
        .select('id,name,size,webUrl,createdDateTime,lastModifiedDateTime')
        .get();

      return response;
    } catch (error) {
      logger.error(`Error getting drive stats: ${error.message}`);
      throw error;
    }
  }

  // ======================================
  // FILE & FOLDER ANALYSIS
  // ======================================

  async analyzeFolder(siteId, driveId, folderId = 'root', depth = 0, maxDepth = 3) {
    if (depth > maxDepth) {
      return { files: [], folders: [], stats: { totalSize: 0, fileCount: 0, folderCount: 0 } };
    }

    try {
      const query = folderId === 'root'
        ? `/sites/${siteId}/drives/${driveId}/root/children`
        : `/sites/${siteId}/drives/${driveId}/items/${folderId}/children`;

      const response = await this.client
        .api(query)
        .select('id,name,size,file,folder,createdDateTime,lastModifiedDateTime,createdBy,webUrl')
        .top(200)
        .get();

      const items = response.value || [];
      const files = [];
      const folders = [];
      let totalSize = 0;
      let fileCount = 0;
      let folderCount = 0;

      for (const item of items) {
        if (item.file) {
          files.push({
            id: item.id,
            name: item.name,
            size: item.size || 0,
            extension: item.name.split('.').pop(),
            created: item.createdDateTime,
            modified: item.lastModifiedDateTime,
            createdBy: item.createdBy?.user?.displayName,
            webUrl: item.webUrl
          });
          totalSize += item.size || 0;
          fileCount++;
        } else if (item.folder) {
          folderCount++;
          // Recursivamente analisar subpastas (com limite de profundidade)
          if (depth < maxDepth) {
            const subFolderAnalysis = await this.analyzeFolder(
              siteId,
              driveId,
              item.id,
              depth + 1,
              maxDepth
            );
            files.push(...subFolderAnalysis.files);
            folders.push(...subFolderAnalysis.folders);
            totalSize += subFolderAnalysis.stats.totalSize;
            fileCount += subFolderAnalysis.stats.fileCount;
            folderCount += subFolderAnalysis.stats.folderCount;
          }

          folders.push({
            id: item.id,
            name: item.name,
            itemCount: item.folder.childCount || 0,
            created: item.createdDateTime,
            modified: item.lastModifiedDateTime,
            webUrl: item.webUrl
          });
        }
      }

      return {
        files,
        folders,
        stats: {
          totalSize,
          fileCount,
          folderCount
        }
      };
    } catch (error) {
      logger.error(`Error analyzing folder: ${error.message}`);
      throw error;
    }
  }

  // ======================================
  // SHARING & PERMISSIONS
  // ======================================

  async getItemSharingStatus(siteId, driveId, itemId) {
    try {
      const response = await this.client
        .api(`/sites/${siteId}/drives/${driveId}/items/${itemId}/permissions`)
        .select('id,grantedToV2,roles,shareId')
        .get();

      const permissions = response.value || [];
      const shared = permissions.some(p => p.roles.includes('read') || p.roles.includes('write'));

      return {
        itemId,
        shared,
        permissionsCount: permissions.length,
        permissions: permissions.map(p => ({
          id: p.id,
          role: p.roles?.[0] || 'read',
          grantedTo: p.grantedToV2?.user?.displayName || p.grantedToV2?.group?.displayName || 'Unknown',
          type: p.grantedToV2?.user ? 'user' : 'group'
        }))
      };
    } catch (error) {
      logger.warn(`Error getting sharing status: ${error.message}`);
      return { itemId, shared: false, permissionsCount: 0, permissions: [] };
    }
  }

  // ======================================
  // ONEDRIVE (Personal)
  // ======================================

  async getUserOneDrive(userId) {
    try {
      const drive = await this.client
        .api(`/users/${userId}/drive`)
        .select('id,name,webUrl,quota')
        .get();

      return drive;
    } catch (error) {
      logger.error(`Error getting OneDrive for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  async listUsers(filter = null) {
    try {
      let query = this.client.api('/users');

      if (filter) {
        query = query.filter(filter);
      }

      const response = await query
        .select('id,displayName,userPrincipalName,mail')
        .top(999)
        .get();

      return response.value || [];
    } catch (error) {
      logger.error(`Error listing users: ${error.message}`);
      throw error;
    }
  }

  // ======================================
  // AUDIT & RISK DETECTION
  // ======================================

  async detectRisks(analysisResult) {
    const risks = [];
    const { files, folders, stats } = analysisResult;

    // Risk 1: Oversized files
    const largeFiles = files.filter(f => f.size > 5 * 1024 * 1024 * 1024); // 5GB+
    if (largeFiles.length > 0) {
      risks.push({
        title: 'Arquivos Muito Grandes',
        description: `${largeFiles.length} arquivo(s) maior que 5GB encontrado(s)`,
        severity: 'medium',
        impact: 'Pode afetar performance de sincronização',
        recommendation: 'Revisar necessidade de arquivos tão grandes',
        count: largeFiles.length,
        examples: largeFiles.slice(0, 3).map(f => f.name)
      });
    }

    // Risk 2: Old files (>2 years)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const oldFiles = files.filter(f => new Date(f.modified) < twoYearsAgo);
    if (oldFiles.length > stats.fileCount * 0.3) { // >30% of files old
      risks.push({
        title: 'Muitos Arquivos Antigos',
        description: `${oldFiles.length} arquivo(s) não modificado(s) há mais de 2 anos`,
        severity: 'low',
        impact: 'Indica dados obsoletos que podem ser arquivados',
        recommendation: 'Considerar arquivar dados antigos ou deletar se não mais necessário',
        count: oldFiles.length
      });
    }

    // Risk 3: Too many files in single folder
    const hugefolders = folders.filter(f => f.itemCount > 1000);
    if (hugefolders.length > 0) {
      risks.push({
        title: 'Pastas com Muitos Itens',
        description: `${hugefolders.length} pasta(s) com mais de 1000 itens`,
        severity: 'low',
        impact: 'Pode causar lentidão ao navegar',
        recommendation: 'Considerar reorganizar estrutura de pastas',
        count: hugefolders.length,
        examples: hugefolders.slice(0, 3).map(f => f.name)
      });
    }

    // Risk 4: File type distribution (many different types = potential chaos)
    const fileExtensions = new Set(files.map(f => f.extension));
    if (fileExtensions.size > 50) {
      risks.push({
        title: 'Muitos Tipos de Arquivo Diferentes',
        description: `${fileExtensions.size} tipo(s) de arquivo diferentes`,
        severity: 'low',
        impact: 'Dificulta padronização e governança de dados',
        recommendation: 'Estabelecer padrão de formato de arquivos',
        count: fileExtensions.size
      });
    }

    return risks;
  }

  // ======================================
  // SUMMARY REPORT
  // ======================================

  async generateSummary(tenantData) {
    try {
      const totalSize = tenantData.sites.reduce((acc, site) => {
        return acc + (site.stats?.totalSize || 0);
      }, 0);

      const totalFiles = tenantData.sites.reduce((acc, site) => {
        return acc + (site.stats?.fileCount || 0);
      }, 0);

      const totalFolders = tenantData.sites.reduce((acc, site) => {
        return acc + (site.stats?.folderCount || 0);
      }, 0);

      const allRisks = tenantData.sites.reduce((acc, site) => {
        return acc.concat(site.risks || []);
      }, []);

      const riskCounts = {
        high: allRisks.filter(r => r.severity === 'high').length,
        medium: allRisks.filter(r => r.severity === 'medium').length,
        low: allRisks.filter(r => r.severity === 'low').length
      };

      return {
        totalSizeGb: (totalSize / 1024 / 1024 / 1024).toFixed(2),
        totalFiles,
        totalFolders,
        totalSites: tenantData.sites.length,
        totalRisks: allRisks.length,
        riskCounts,
        topRisks: allRisks.sort((a, b) => {
          const severityOrder = { high: 0, medium: 1, low: 2 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        }).slice(0, 10)
      };
    } catch (error) {
      logger.error(`Error generating summary: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new SharePointService();
