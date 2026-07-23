const express = require('express')
const router = express.Router()
const governanceService = require('../services/governanceService')

// ========================================
// Files Analysis Routes
// ========================================

router.get('/clients/:clientId/files/dashboard', async (req, res) => {
  try {
    const { clientId } = req.params
    const data = await governanceService.getFilesDashboard(clientId)
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/clients/:clientId/files/stale', async (req, res) => {
  try {
    const { clientId } = req.params
    const { minYears = 1, limit = 100 } = req.query
    const data = await governanceService.getStaleFiles(clientId, parseInt(minYears), parseInt(limit))
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/clients/:clientId/files/duplicates', async (req, res) => {
  try {
    const { clientId } = req.params
    const { limit = 50 } = req.query
    const data = await governanceService.getDuplicateCandidates(clientId, parseInt(limit))
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/clients/:clientId/files/by-type', async (req, res) => {
  try {
    const { clientId } = req.params
    const data = await governanceService.getFilesByType(clientId)
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ========================================
// Trash Analysis Routes
// ========================================

router.get('/clients/:clientId/trash/dashboard', async (req, res) => {
  try {
    const { clientId } = req.params
    const data = await governanceService.getTrashDashboard(clientId)
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/clients/:clientId/trash/items', async (req, res) => {
  try {
    const { clientId } = req.params
    const { siteFilter, limit = 500 } = req.query
    const data = await governanceService.getTrashItems(clientId, siteFilter, parseInt(limit))
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/clients/:clientId/trash/by-site', async (req, res) => {
  try {
    const { clientId } = req.params
    const data = await governanceService.getTrashSummaryBySite(clientId)
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ========================================
// Recommendations Routes
// ========================================

router.get('/recommendations', async (req, res) => {
  try {
    const { clientId, type, limit = 20 } = req.query
    const data = await governanceService.getRecommendations(clientId, type, parseInt(limit))
    res.json({ data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

router.patch('/recommendations/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params
    const result = await governanceService.markRecommendationAsResolved(id)
    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ========================================
// Data Import Routes
// ========================================

router.post('/clients/:clientId/import/files', async (req, res) => {
  try {
    const { filesData } = req.body
    const result = await governanceService.importFilesData(filesData)
    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/clients/:clientId/import/trash', async (req, res) => {
  try {
    const { trashData } = req.body
    const result = await governanceService.importTrashData(trashData)
    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ========================================
// Report Generation
// ========================================

router.get('/clients/:clientId/report', async (req, res) => {
  try {
    const { clientId } = req.params
    const report = await governanceService.generateGovernanceReport(clientId)
    res.json({ data: report })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
