/** バックエンド共通インターフェース: issue → patch */
export type TaskInput = {
  repoUrl: string;
  issueUrl: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
};

export type TaskResult = {
  success: boolean;
  patch: string;
  modelUsed: string;
  error?: string;
};

export interface Backend {
  readonly name: string;
  run(input: TaskInput): Promise<TaskResult>;
}
