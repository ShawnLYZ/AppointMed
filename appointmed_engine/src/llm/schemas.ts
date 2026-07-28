import type { Prefs, Symptoms, Verdict } from '../workflow/types.js';

export const SPECIALTIES = ['General Practice', 'Cardiology', 'Dermatology', 'Orthopedics',
  'Pediatrics', 'Neurology', 'ENT', 'Gastroenterology', 'Pulmonology'] as const;
export const URGENCIES = ['asap', 'week', 'month', 'routine'] as const;

const nullable = (t: string) => ({ type: [t, 'null'] });
const symptomFieldProps = {
  mainComplaint: nullable('string'), duration: nullable('string'), severity: nullable('number'),
  associatedSymptoms: nullable('string'), medicalHistory: nullable('string'), currentMedications: nullable('string'),
};

export interface IntakeDecision { reply: string; complete: boolean; redFlag: boolean; redFlagReason?: string; fields: Symptoms }
export const intakeSchema = {
  type: 'object', required: ['reply', 'complete', 'redFlag', 'fields'], additionalProperties: false,
  properties: {
    reply: { type: 'string' }, complete: { type: 'boolean' },
    redFlag: { type: 'boolean' }, redFlagReason: { type: 'string' },
    fields: { type: 'object', required: Object.keys(symptomFieldProps), additionalProperties: false, properties: symptomFieldProps },
  },
};

export type TriageDecision = Verdict;
export const triageSchema = {
  type: 'object', required: ['specialty', 'urgency', 'explanation', 'redFlags'], additionalProperties: false,
  properties: {
    specialty: { type: 'string', enum: [...SPECIALTIES] },
    urgency: { type: 'string', enum: [...URGENCIES] },
    explanation: { type: 'string' },
    redFlags: { type: 'array', items: { type: 'string' } },
  },
};

export interface PrefsDecision { reply: string; complete: boolean; prefs: Prefs }
export const prefsSchema = {
  type: 'object', required: ['reply', 'complete', 'prefs'], additionalProperties: false,
  properties: {
    reply: { type: 'string' }, complete: { type: 'boolean' },
    prefs: {
      type: 'object', required: ['budget', 'preferredHospital', 'preferredTime'], additionalProperties: false,
      properties: {
        budget: nullable('number'), preferredHospital: nullable('string'),
        preferredTime: { type: ['string', 'null'], enum: ['morning', 'afternoon', 'evening', 'any', null] },
      },
    },
  },
};

export interface RelaxDecision { relax: 'time' | 'hospital' | 'budget'; explanation: string }
export const relaxSchema = {
  type: 'object', required: ['relax', 'explanation'], additionalProperties: false,
  properties: { relax: { type: 'string', enum: ['time', 'hospital', 'budget'] }, explanation: { type: 'string' } },
};

export interface SummaryDecision { summary: string; priority: 'low' | 'medium' | 'high' }
export const summarySchema = {
  type: 'object', required: ['summary', 'priority'], additionalProperties: false,
  properties: { summary: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } },
};
