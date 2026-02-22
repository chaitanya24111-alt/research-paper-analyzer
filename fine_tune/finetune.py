"""Fine-tune llama3.1:8b on arXiv CS/AI papers using Unsloth + LoRA.

Requires a CUDA GPU with ≥16 GB VRAM (or use the Kaggle notebook for free T4 access).

Dependencies (install before running):
    pip install unsloth trl transformers datasets accelerate bitsandbytes

Usage:
    python fine_tune/finetune.py
"""

from __future__ import annotations

import os

# ── Config ──────────────────────────────────────────────────────────────────
BASE_MODEL = "unsloth/Meta-Llama-3.1-8B-bnb-4bit"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
TRAIN_FILE = os.path.join(os.path.dirname(__file__), "train.jsonl")
VAL_FILE = os.path.join(os.path.dirname(__file__), "val.jsonl")
LOG_FILE = os.path.join(os.path.dirname(__file__), "training_log.txt")

MAX_SEQ_LENGTH = 2048
LOAD_IN_4BIT = True

# LoRA hyperparameters
LORA_R = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05
LORA_TARGET_MODULES = [
    "q_proj", "k_proj", "v_proj", "o_proj",
    "gate_proj", "up_proj", "down_proj",
]

# Training hyperparameters
NUM_TRAIN_EPOCHS = 3
PER_DEVICE_TRAIN_BATCH_SIZE = 2
GRADIENT_ACCUMULATION_STEPS = 4
LEARNING_RATE = 2e-4
WARMUP_STEPS = 50
LOGGING_STEPS = 50
SAVE_STEPS = 500

# Alpaca-style instruction template (unsloth default)
ALPACA_TEMPLATE = (
    "Below is an instruction that describes a task. "
    "Write a response that appropriately completes the request.\n\n"
    "### Instruction:\n{prompt}\n\n### Response:\n{response}"
)
EOS_TOKEN = ""  # filled at runtime from tokenizer


def format_sample(sample: dict, eos_token: str) -> dict:
    text = ALPACA_TEMPLATE.format(
        prompt=sample["prompt"],
        response=sample["response"],
    ) + eos_token
    return {"text": text}


class LossLoggerCallback:
    """Write training loss to LOG_FILE every LOGGING_STEPS steps."""

    def __init__(self, log_path: str):
        self.log_path = log_path
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "w") as fh:
            fh.write("step,loss\n")

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs and "loss" in logs:
            with open(self.log_path, "a") as fh:
                fh.write(f"{state.global_step},{logs['loss']:.6f}\n")


def main() -> None:
    # ── 1. Load base model ───────────────────────────────────────────────────
    print(f"[1/5] Loading base model: {BASE_MODEL}")
    from unsloth import FastLanguageModel  # type: ignore
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=MAX_SEQ_LENGTH,
        load_in_4bit=LOAD_IN_4BIT,
        dtype=None,  # auto-detect
    )

    # ── 2. Apply LoRA ────────────────────────────────────────────────────────
    print("[2/5] Applying LoRA adapters …")
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        target_modules=LORA_TARGET_MODULES,
        lora_dropout=LORA_DROPOUT,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    # ── 3. Load dataset ──────────────────────────────────────────────────────
    print(f"[3/5] Loading dataset from {TRAIN_FILE} / {VAL_FILE} …")
    from datasets import load_dataset  # type: ignore
    dataset = load_dataset(
        "json",
        data_files={"train": TRAIN_FILE, "validation": VAL_FILE},
    )

    eos_token = tokenizer.eos_token or "<|end_of_text|>"
    dataset = dataset.map(
        lambda s: format_sample(s, eos_token),
        remove_columns=["prompt", "response"],
    )
    print(f"      Train: {len(dataset['train']):,} samples | Val: {len(dataset['validation']):,} samples")

    # ── 4. Train ─────────────────────────────────────────────────────────────
    print("[4/5] Starting training …")
    from trl import SFTTrainer  # type: ignore
    from transformers import TrainingArguments, TrainerCallback  # type: ignore

    class _LossCallback(TrainerCallback):
        def __init__(self):
            self._logger = LossLoggerCallback(LOG_FILE)

        def on_log(self, args, state, control, logs=None, **kwargs):
            self._logger.on_log(args, state, control, logs=logs, **kwargs)

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=NUM_TRAIN_EPOCHS,
        per_device_train_batch_size=PER_DEVICE_TRAIN_BATCH_SIZE,
        gradient_accumulation_steps=GRADIENT_ACCUMULATION_STEPS,
        learning_rate=LEARNING_RATE,
        warmup_steps=WARMUP_STEPS,
        logging_steps=LOGGING_STEPS,
        save_steps=SAVE_STEPS,
        fp16=True,
        optim="adamw_8bit",
        lr_scheduler_type="cosine",
        report_to="none",
        evaluation_strategy="epoch",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset["train"],
        eval_dataset=dataset["validation"],
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        args=training_args,
        callbacks=[_LossCallback()],
    )

    trainer.train()

    # ── 5. Save ──────────────────────────────────────────────────────────────
    print(f"[5/5] Saving model to {OUTPUT_DIR} …")
    trainer.model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"\nTraining complete. Loss log: {LOG_FILE}")
    print("Next step: python fine_tune/convert_to_ollama.py")


if __name__ == "__main__":
    main()
