import { useState } from "react";

const DEFAULT_TRAFFIC = 5000;
const DEFAULT_DATASET = 100;
const DEFAULT_READ_RATIO = 50;
const DEFAULT_NETWORK_LATENCY = 100;

export function useSimulationInputs(initial?: {
  traffic?: number;
  dataset?: number;
  readRatio?: number;
  networkLatency?: number;
}) {
  const [traffic, setTraffic] = useState(initial?.traffic ?? DEFAULT_TRAFFIC);
  const [dataset, setDataset] = useState(initial?.dataset ?? DEFAULT_DATASET);
  const [readRatio, setReadRatio] = useState(initial?.readRatio ?? DEFAULT_READ_RATIO);
  const [networkLatency, setNetworkLatency] = useState(
    initial?.networkLatency ?? DEFAULT_NETWORK_LATENCY,
  );

  const reset = () => {
    setTraffic(DEFAULT_TRAFFIC);
    setDataset(DEFAULT_DATASET);
    setReadRatio(DEFAULT_READ_RATIO);
    setNetworkLatency(DEFAULT_NETWORK_LATENCY);
  };

  return {
    traffic,
    setTraffic,
    dataset,
    setDataset,
    readRatio,
    setReadRatio,
    networkLatency,
    setNetworkLatency,
    reset,
  };
}
