---
title: 'Use Code Llama for Copilot Code Completion'
description: 'Run Code Llama behind an OpenAI API-compatible server and point the VSCode Copilot extension at it.'
pubDate: '2023-08-27'
tags: [llm, ai, kubernetes, llama]
thumbnail: '../../assets/code-llama-as-copilot-replacement/thumbnail.png'
---

[CodeLlama](https://huggingface.co/docs/transformers/main/model_doc/code_llama) is now available under a commercial-friendly license.

The question arises: Can we replace GitHub Copilot and use [CodeLlama](https://huggingface.co/docs/transformers/main/model_doc/code_llama) as the code completion LLM without transmitting source code to the _cloud_?

The answer is both yes and no. Tweaking hyperparameters becomes essential in this endeavor. Let's explore the options available as of August 2023.

> Note: You might want to read my latest article on [copilot](/blog/i-made-a-copilot-in-rust/)

By analyzing CodePilot's VSCode extension[^1] at [thakkarparth007/copilot-explorer](https://github.com/thakkarparth007/copilot-explorer), it becomes evident that CodePilot relies on an OpenAI API-compatible backend. Drawing from prior experiences such as [fauxpilot](https://github.com/fauxpilot/fauxpilot), we understand that it's possible to switch the backend by introducing specific modifications to the [`settings.json`](https://code.visualstudio.com/docs/getstarted/settings) file:

```js
"github.copilot.advanced": {
  // fauxpilot was using `codegen`
  "debug.overrideEngine": "codegen",
  // OpenAI API compatible server url
  "debug.testOverrideProxyUrl": "http://localhost:5000",
  "debug.overrideProxyUrl": "http://localhost:5000" 
}
```

## Choosing an OpenAI API-Compatible Server

To make use of CodeLlama, an OpenAI API-compatible server is all that's required. As of 2023, there are numerous options available, and here are a few noteworthy ones:

- [llama-cpp-python](https://github.com/abetlen/llama-cpp-python/tree/main#web-server): This Python-based option supports llama models exclusively.
- [vllm](https://github.com/vllm-project/vllm): Known for high performance, though it lacks support for GGML.
- [flexflow](https://github.com/flexflow/FlexFlow): Touting faster performance compared to `vllm`.
- [LocalAI](https://github.com/go-skynet/LocalAI): A feature-rich choice that even supports image generation.
- [FastChat](https://github.com/lm-sys/FastChat/blob/main/docs/openai_api.md): Developed by LMSYS.
- [OpenLLM](https://github.com/bentoml/OpenLLM): An actively developed project.
- [ialacol](https://github.com/chenhunghan/ialacol): Noteworthy for its focus on Kubernetes.
- ...and many more

The choice among these options is entirely up to you. For the purpose of this article, I'll be focusing on [ialacol](https://github.com/chenhunghan/ialacol), primarily because I am the main contributor and thus intimately familiar with all the implementation details.

Let's begin with GGML models. These models boast a low memory requirement and operate without the need for a GPU (which might not be as affordable anymore). If you possess robust CUDA (Nvidia) GPUs, I recommend directly proceeding to the GPTQ section of this article.

## Setting up the OpenAI API-Compatible Server

Getting your OpenAI API-compatible server up and running is a straightforward process.

### Clone the Repository and Install Dependencies

Use this one-liner to clone the repository and set up the necessary dependencies:

```bash
gh repo clone chenhunghan/ialacol && cd ialacol && python3 -m venv .venv && source .venv/bin/activate && python3 -m pip install -r requirements.txt
```

### Run the server and download the [model](https://huggingface.co/TheBloke/CodeLlama-7B-GGML).

```bash
export DEFAULT_MODEL_HG_REPO_ID="TheBloke/CodeLlama-7B-GGML"
export DEFAULT_MODEL_FILE="codellama-7b.ggmlv3.Q2_K.bin
"
export LOGGING_LEVEL="DEBUG" # optional, more on this later
uvicorn main:app --host 0.0.0.0 --port 9999
```

### Configure VSCode Copilot extension, pointing to the server.

To integrate the server with the VSCode Copilot extension, edit `settings.json`:

```js
"github.copilot.advanced": {
  "debug.overrideEngine": "codellama-7b.ggmlv3.Q2_K.bin",
  "debug.testOverrideProxyUrl": "http://localhost:9999",
  "debug.overrideProxyUrl": "http://localhost:9999"
}
```
With these configurations in place, you're ready to roll. CodeLlama's code completion capabilities will now be at your fingertips.

## Tweaking for Optimal Performance

While CodeLlama's completion capabilities are impressive, they might not always meet your expectations, yielding occasional suggestions by chance. However, they might not match the proficiency of GitHub Copilot, especially in terms of inference speed.

Several factors contribute to this discrepancy:

- Our current model utilizes 7 billion parameters. To potentially enhance performance, consider experimenting with the [13B](https://huggingface.co/TheBloke/CodeLlama-13B-GGML) and [34B](https://huggingface.co/TheBloke/CodeLlama-34B-GGUF) variants.
- GGML/GGUF models are tailored to minimize memory usage rather than prioritize speed. While they excel in asynchronous tasks, code completion mandates swift responses from the server.
- GitHub Copilot's extension generates a multitude of requests as you type, which can pose challenges, given that language models typically process one prompt at a time.

To address these considerations, exploring smaller models is a viable option. Smaller models often exhibit a _faster_ inference speed. Here are some alternatives to consider:

- [CodeGen](https://github.com/salesforce/CodeGen) offers a [2B quantized version](https://huggingface.co/ravenscroftj/CodeGen-2B-multi-ggml-quant).
- [Replit-Code](https://huggingface.co/replit/replit-code-v1-3b) provides a [3B quantized version](https://huggingface.co/abetlen/replit-code-v1-3b-ggml).
- [StarCoder](https://huggingface.co/bigcode/starcoder) presents a [quantized version](https://huggingface.co/TheBloke/starcoder-GGML) as well as a [quantized 1B version](https://huggingface.co/mike-ravkine/gpt_bigcode-santacoder-GGML).
- [TinyCoder](https://huggingface.co/bigcode/tiny_starcoder_py) stands as a very compact model with only 164 million parameters (specifically for `python`). There's even a [quantized version](https://huggingface.co/mike-ravkine/tiny_starcoder_py-GGML).
- [Stablecode-Completion](https://huggingface.co/stabilityai/stablecode-completion-alpha-3b-4k) by StabilityAI also offers a [quantized version](https://huggingface.co/TheBloke/stablecode-completion-alpha-3b-4k-GGML).

For a potential increase in throughput, a useful strategy is queuing requests before the inference server. This optimization boosts throughput (not speed) and can be achieved using tools like [text-inference-batcher](https://github.com/ialacol/text-inference-batcher) (Disclaimer: I authored this tool, and `tib` is still in its early alpha phase).

Leveraging the various trade-offs at our disposal, let's proceed with the plan: utilizing a high-quality 3B model with a small footprint. Additionally, let's set up two instances of servers to enhance performance further.

```bash
# in `ialacol` folder you just cloned.
export THREAD=2
# Use small model https://stability.ai/blog/stablecode-llm-generative-ai-coding
export DEFAULT_MODEL_HG_REPO_ID="TheBloke/TheBloke/stablecode-completion-alpha-3b-4k-GGML"
export DEFAULT_MODEL_FILE="stablecode-completion-alpha-3b-4k.ggmlv1.q4_0.bin"
# truncate the prompt to make inference faster...
# (it's a trade off, you get lower quality results too)
TRUNCATE_PROMPT_LENGTH=100
uvicorn main:app --host 0.0.0.0 --port 9998
# in another terminal session
uvicorn main:app --host 0.0.0.0 --port 9999 
```

### Load Balancing with a Queue to Increase Throughput

To enhance throughput, we can employ load balancing with a queuing mechanism. Here's how you can set it up using [text-inference-batcher](https://github.com/ialacol/text-inference-batcher):

#### Setting Up `tib` for Load Balancing

1. Clone the repository and set up the necessary environment:

```sh
# clone and setup
gh repo clone ialacol/text-inference-batcher && cd text-inference-batcher && npm install
```

2. Start tib, directing to your servers.
```
export UPSTREAMS="http://localhost:9998,http://localhost:9999"
npm start
```

3. Configuring the Copilot Extension, directing to the load balancer.

```js
"github.copilot.advanced": {
  "debug.overrideEngine": "stablecode-completion-alpha-3b-4k.ggmlv1.q4_0.bin",
  // pointing to `tib`
  "debug.testOverrideProxyUrl": "http://localhost:8000",
  "debug.overrideProxyUrl": "http://localhost:8000"
}
```

Despite the compromise in inference quality due to smaller models and prompt truncation, results improved. However, they still fall short of GitHub Copilot's code completion capabilities.

Let's now venture to push the limits in the opposite direction.

## Leveraging Cloud Infrastructure for Enhanced Performance

If you possess powerful cloud infrastructure equipped with GPUs, the process becomes notably streamlined.

In this scenario, we will harness the capabilities of Kubernetes due to its exceptional automation features. Both [ialacol](https://github.com/chenhunghan/ialacol) and [text-inference-batcher](https://github.com/ialacol/text-inference-batcher) are inherently compatible with Kubernetes, which further simplifies the setup.

Let's delve into deploying the [34B CodeLLama GPTQ model](https://huggingface.co/TheBloke/CodeLlama-34B-GPTQ) onto Kubernetes clusters, leveraging CUDA acceleration via the `Helm` package manager:

(`values.yaml`)
```yaml
replicas: 1
deployment:
  image: ghcr.io/chenhunghan/ialacol-gptq:latest
  env:
    DEFAULT_MODEL_HG_REPO_ID: TheBloke/CodeLlama-34B-GPTQ
    TOP_K: 30
    TOP_P: 0.9
    MAX_TOKENS: 200
    THREADS: 1
resources:
  # Request a node with Nvidia 1 GPU
  limits:
    nvidia.com/gpu: 1
model:
  persistence:
    size: 30Gi
    accessModes:
      - ReadWriteOnce
    storageClassName: ~
service:
  type: ClusterIP
  port: 8000
  annotations: {}
# You probably need to use these to select a node with GPUs.
tolerations: []
affinity: {}
```

```sh
helm repo add ialacol https://chenhunghan.github.io/ialacol
helm repo update
# work one
helm upgrade --install codellama-worker-0 ialacol/ialacol -f values.yaml
# work two
helm upgrade --install codellama-worker-1 ialacol/ialacol -f values.yaml
# and maybe more? Depends on your budget :)
```

Again, load balancing using `tib` with this `values.yaml`:

```yaml
replicas: 1
deployment:
  image: ghcr.io/ialacol/text-inference-batcher-nodejs:latest
  env:
    # pointing to our workers
    UPSTREAMS: "http://codellama-worker-0:8000,http://codellama-worker-1:8000"
    # increase this if your the worker can handle more then one inference at a time.
    MAX_CONNECT_PER_UPSTREAM: 1
resources:
  requests:
    cpu: 500m
    memory: 128Mi
service:
  type: ClusterIP
  port: 8000
  annotations: {}
  # If using an AWS load balancer, you'll need to override the default 60s load balancer idle timeout
  # service.beta.kubernetes.io/aws-load-balancer-connection-idle-timeout: "1200"
nodeSelector: {}
tolerations: []
affinity: {}
```

```bash
helm upgrade --install tib text-inference-batcher/text-inference-batcher-nodejs -f values.yaml
```

Expose the `tib` service by utilizing your cloud's load balancer, or for testing purposes, you can employ `kubectl port-forward`.

## Conclusion

With CodeLLama operating at 34B, benefiting from CUDA acceleration, and employing at least one worker, the code completion experience becomes not only swift but also of commendable quality. I would confidently state that this setup is on par with the performance of GitHub Copilot.

Nonetheless, it's crucial to acknowledge that this particular configuration does come at a notably higher cost when compared to [GitHub Copilot](https://github.com/features/copilot#pricing). Striking a balance between budget considerations and privacy concerns is imperative. This investment is especially justifiable when handling proprietary or enterprise-level software projects. Conversely, the pricing structure of Copilot holds its own appeal.

In essence, we're fortunate to have a range of options at our disposal. Your thoughts and feedback are valuable, so feel free to share your insights in the comments section.

Let's keep the conversation going! 🚀

[^1]: Highly recommended to go through the Copilot source code, you will learn prompt engineering and client cache on different levels before hitting the server.
