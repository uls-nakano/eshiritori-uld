import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { beforeAll, describe, it } from "vitest";

import * as previewAnnotations from "../.storybook/preview";

const annotations = setProjectAnnotations([previewAnnotations]);
beforeAll(annotations.beforeAll);

type StoryFile = Parameters<typeof composeStories>[0];
const storyFiles = import.meta.glob<StoryFile>("./**/*.stories.tsx", { eager: true });

interface ComposedStory {
  storyName: string;
  run: () => Promise<void>;
}

for (const [path, storyFile] of Object.entries(storyFiles)) {
  describe(path, () => {
    for (const story of Object.values<ComposedStory>(composeStories(storyFile))) {
      it(story.storyName, async () => {
        await story.run();
      });
    }
  });
}
