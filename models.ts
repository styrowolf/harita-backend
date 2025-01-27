import { z } from "zod";

export const AddMapRequest = z.object({
  name: z.string(),
  description: z.string(),
  public: z.boolean(),
});

export type AddMapRequest = z.infer<typeof AddMapRequest>;

export const AddSourceRequest = z.object({
    mapId: z.string(),
    name: z.string(),
    color: z.string(),
    format: z.string(),
});
  
export type AddSourceRequest = z.infer<typeof AddSourceRequest>;

export interface MapRow {
    id: string;
    name: string;
    description: string;
    user: string;
    public: boolean;
}

export interface SourceRow {
    id: string;
    name: string;
    color: string;
    map: string;
    format: string;
}

export const AssembleMapRequest = z.object({
    id: z.string(),
});

export type AssembleMapRequest = z.infer<typeof AddSourceRequest>;

export const GetMapRequest = z.object({
    id: z.string(),
});

export type GetMapRequest = z.infer<typeof GetMapRequest>;

export const DeleteMapRequest = z.object({
    id: z.string(),
});

export type DeleteMapRequest = z.infer<typeof DeleteMapRequest>;