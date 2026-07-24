const express = require('express');
const purviewService = require('../services/purviewService');

const router = express.Router();

// Obter resumo de Data Map
router.get('/clients/:clientId/purview/data-map', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterResumoDataMap(tenantId);

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter tipos de dados sensíveis
router.get('/clients/:clientId/purview/sensitive-types', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { severidade } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterTiposDadosSensiveis(tenantId, { severidade });

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter localizações de dados sensíveis
router.get('/clients/:clientId/purview/sensitive-locations', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterLocalizacoesSensíveis(tenantId);

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter políticas DLP
router.get('/clients/:clientId/purview/dlp-policies', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { status, severidade } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterPoliticasDLP(tenantId, { status, severidade });

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter violações DLP
router.get('/clients/:clientId/purview/dlp-violations', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { diasRetorno = 30, severidade, resolvida } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterViolacoesDLP(tenantId, parseInt(diasRetorno), {
      severidade,
      resolvida: resolvida === 'true',
    });

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter resumo de violações DLP
router.get('/clients/:clientId/purview/dlp-violations/resumo', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { diasRetorno = 30 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterResumoViolacoesDLP(tenantId, parseInt(diasRetorno));

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter frameworks de conformidade
router.get('/clients/:clientId/purview/compliance-frameworks', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterFrameworksConformidade(tenantId);

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter postura de conformidade
router.get('/clients/:clientId/purview/compliance-posture', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterPosturaConformidade(tenantId);

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter avaliação de risco de dados
router.get('/clients/:clientId/purview/data-risk-assessment', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterAvaliacaoRiscoDados(tenantId);

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter recomendações de risco
router.get('/clients/:clientId/purview/recommendations', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { prioridade, status } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterRecomendacoesRisco(tenantId, { prioridade, status });

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Marcar recomendação como resolvida
router.patch('/clients/:clientId/purview/recommendations/:recommendationId/resolve', async (req, res) => {
  try {
    const { clientId, recommendationId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.marcarRecomendacaoResolvida(tenantId, parseInt(recommendationId));

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        mensagem: resultado.mensagem,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter resumo agregado
router.get('/clients/:clientId/purview/summary', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterResumoAgregado(tenantId);

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter histórico de conformidade
router.get('/clients/:clientId/purview/compliance-history', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { diasRetorno = 30 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterHistoricoConformidade(tenantId, parseInt(diasRetorno));

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

// Obter histórico de risco
router.get('/clients/:clientId/purview/risk-history', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { diasRetorno = 30 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await purviewService.obterHistoricoRiscoDados(tenantId, parseInt(diasRetorno));

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

module.exports = router;
