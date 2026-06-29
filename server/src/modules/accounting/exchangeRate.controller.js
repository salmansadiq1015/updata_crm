import exchangeRateService from './exchangeRate.service.js';
import fxRevaluationService from './fxRevaluation.service.js';

class ExchangeRateController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const rates = await exchangeRateService.list(query);
      return res.success({ data: rates });
    } catch (err) { next(err); }
  }

  async upsert(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const rate = await exchangeRateService.upsert(req.body, req.user._id, meta);
      return res.success({ data: rate, message: 'Exchange rate saved', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async resolve(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const rate = await exchangeRateService.resolveRate(query);
      return res.success({ data: rate });
    } catch (err) { next(err); }
  }

  async convert(req, res, next) {
    try {
      const conversion = await exchangeRateService.convert(req.body);
      return res.success({ data: conversion });
    } catch (err) { next(err); }
  }

  async previewRevaluation(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const preview = await fxRevaluationService.preview(query);
      return res.success({ data: preview });
    } catch (err) { next(err); }
  }

  async postRevaluation(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const run = await fxRevaluationService.post(req.body, req.user._id, meta);
      return res.success({ data: run, message: 'FX revaluation posted', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listRevaluationRuns(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const runs = await fxRevaluationService.listRuns(query);
      return res.success({ data: runs });
    } catch (err) { next(err); }
  }
}

const exchangeRateController = new ExchangeRateController();
export default exchangeRateController;
