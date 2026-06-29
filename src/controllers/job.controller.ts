import { Request, Response } from 'express';
import { jobService } from '../services/job.service';
import { asyncHandler } from '../utils/async-handler';
import { CreateJobInput } from '../validators/job.validator';

export const createJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await jobService.create(req.user!.userId, req.body as CreateJobInput);
  res.status(201).json({ success: true, data: job });
});

export const getJobs = asyncHandler(async (req: Request, res: Response) => {
  const jobs = await jobService.findAllByUser(req.user!.userId);
  res.status(200).json({ success: true, count: jobs.length, data: jobs });
});

export const getJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await jobService.findOne(req.params.id, req.user!.userId);
  res.status(200).json({ success: true, data: job });
});

export const deleteJob = asyncHandler(async (req: Request, res: Response) => {
  await jobService.delete(req.params.id, req.user!.userId);
  res.status(204).send();
});
