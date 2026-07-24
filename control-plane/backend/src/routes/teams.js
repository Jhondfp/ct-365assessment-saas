const express = require('express');
const teamsService = require('../services/teamsService');

const router = express.Router();

// Obter análise completa de Teams com filtros
router.get('/clients/:clientId/times', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { riskLevel, isArchived, isPublic } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const filtros = {};
    if (riskLevel) filtros.riskLevel = riskLevel;
    if (isArchived !== undefined) filtros.isArchived = isArchived === 'true';
    if (isPublic !== undefined) filtros.isPublic = isPublic === 'true';

    const resultado = await teamsService.obterAnaliseTeams(tenantId, filtros);

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

// Obter Teams orfãos
router.get('/clients/:clientId/times/orfaos', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await teamsService.obterTeamsOrfaos(tenantId);

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

// Obter Teams inativos
router.get('/clients/:clientId/times/inativos', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { diasInatividade = 180 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await teamsService.obterTeamsInativos(tenantId, parseInt(diasInatividade));

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

// Obter Teams de alto risco
router.get('/clients/:clientId/times/alto-risco', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { limiteRisco = 50 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await teamsService.obterTeamsAltoRisco(tenantId, parseInt(limiteRisco));

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

// Obter detalhes de um Time específico
router.get('/clients/:clientId/times/:teamId', async (req, res) => {
  try {
    const { clientId, teamId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await teamsService.obterDetalheTime(tenantId, teamId);

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(404).json({
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

// Obter recomendações de um Time
router.get('/clients/:clientId/times/:teamId/recomendacoes', async (req, res) => {
  try {
    const { clientId, teamId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await teamsService.obterRecomendacoesTime(tenantId, teamId);

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

// Obter resumo de Teams (agregações)
router.get('/clients/:clientId/times/resumo', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { data } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await teamsService.obterResumoTeams(tenantId, data);

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

// Obter distribuição de risco
router.get('/clients/:clientId/times/distribuicao/risco', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await teamsService.obterDistribuicaoRisco(tenantId);

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

// Obter canais inativos
router.get('/clients/:clientId/times/canais/inativos', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { diasSemAtividade = 90 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const resultado = await teamsService.obterCanaisInativos(tenantId, parseInt(diasSemAtividade));

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
