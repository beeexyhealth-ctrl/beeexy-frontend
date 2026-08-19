import { z } from "zod";

export const preTriageAnswersSchema = z.object({
  symptom: z.string().trim().min(2).max(500),
  sexAtBirth: z.enum(["female", "male", "prefer_not_to_say"]),
  ageRange: z.enum(["0_17", "18_29", "30_49", "50_64", "65_plus"]),
  watchedEducation: z.boolean().nullable(),
  viewedTimeline: z.boolean().nullable(),
  duration: z.string().trim().min(1).max(100).nullable(),
  painLevel: z.number().int().min(1).max(10).nullable(),
  otherSymptoms: z.string().trim().max(1000).nullable()
});

export const bookingSchema = z.object({
  doctorId: z.string().uuid(),
  slotId: z.string().uuid(),
  dependentId: z.string().uuid().nullable(),
  reason: z.string().trim().max(1000).nullable()
});

export const dependentSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  relationship: z.string().trim().min(1).max(50),
  birthDate: z.iso.date(),
  sexAtBirth: z.enum(["female", "male", "prefer_not_to_say"]),
  state: z.string().trim().min(2).max(80)
});
