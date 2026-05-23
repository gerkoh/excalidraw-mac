import { describe, expect, it } from "vitest";
import { withDagreLayout } from "./dagreLayout";
import { findOverlappingPairs } from "./diagramOverlap";
import { DIAGRAM_FIXTURES } from "./diagramFixtures";

const PROMPT_FIXTURES = [
  ["oauth2Flow", DIAGRAM_FIXTURES.oauth2Flow],
  ["restApiCrud", DIAGRAM_FIXTURES.restApiCrud],
  ["pubSubQueue", DIAGRAM_FIXTURES.pubSubQueue],
  ["loadBalancer", DIAGRAM_FIXTURES.loadBalancer],
  ["ciCdPipeline", DIAGRAM_FIXTURES.ciCdPipeline],
  ["kubernetesIngress", DIAGRAM_FIXTURES.kubernetesIngress],
  ["tlsHandshake", DIAGRAM_FIXTURES.tlsHandshake],
  ["eventSourcing", DIAGRAM_FIXTURES.eventSourcing],
  ["cacheAside", DIAGRAM_FIXTURES.cacheAside],
];

describe("withDagreLayout prompt fixtures", () => {
  it.each(PROMPT_FIXTURES)("%s — no semantic node overlap", (_name, fixture) => {
    const out = withDagreLayout(fixture());
    expect(findOverlappingPairs(out, { minGap: 4 })).toHaveLength(0);
  });
});
