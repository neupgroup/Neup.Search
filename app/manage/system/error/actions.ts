
"use server"

export type SystemError = {
  id: string;
  message: string;
  context: string;
  stack?: string;
  createdAt: Date;
}

export async function getErrors(): Promise<SystemError[]> {
    return [];
}
