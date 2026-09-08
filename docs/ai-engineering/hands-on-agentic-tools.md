---
id: hands-on-agentic-tools
title: "Hands-On Lab: Building Autonomous Agentic Tools from Scratch"
sidebar_label: "7. Lab: Autonomous Agent & Tools"
sidebar_position: 7
---

# Hands-On Lab: Building Autonomous Agentic Tools from Scratch

> **Lab Objective**: Build a fully autonomous **Storage SRE AI Agent** from first principles in pure Python using a **local Ollama LLM**.  
> **Storage Engineering Domain**: The agent inspects hardware health (SMART counters), calculates storage array capacities, recommends Linux kernel I/O schedulers, and executes synthetic benchmarks—running **100% locally with zero cloud API keys**.

---

## 1. Cognitive Architecture of Our Local Storage SRE Agent

```
                          User Request: "Diagnose NVMe /dev/nvme0n1 and calculate RAID-6 for 8x16TB"
                               │
                               ▼
            ┌───────────────────────────────────────────────────────────┐
            │ Agent Loop (Conversation Context Memory)                  │
            │                                                           │
            │   1. Call Ollama with Available Tool Schemas:             │
            │      - calculate_raid_storage()                           │
            │      - inspect_linux_io_scheduler()                       │
            │      - parse_smart_telemetry()                            │
            │                                                           │
            │   2. Inspect LLM Message:                                 │
            │      - Did model emit tool_calls?                         │
            │        ├─► YES: Dispatch & Execute Local Python Function  │
            │        │        Inject Result as 'tool' role              │
            │        │        Loop back to Step 1                       │
            │        │                                                  │
            │        └─► NO:  Final Root Cause / Answer Reached!        │
            │                 Return response to User                   │
            └───────────────────────────────────────────────────────────┘
```

---

## 2. Environment Setup

Install the lightweight helper libraries:

```bash
pip install requests psutil
```

Ensure `llama3.2` is running locally:
```bash
ollama pull llama3.2
```

---

## 3. The Complete Autonomous Storage SRE Agent Script (`storage_agent.py`)

Save the following code as `storage_agent.py`:

```python
#!/usr/bin/env python3
"""
Autonomous Storage SRE AI Agent using Local Ollama.
Demonstrates native Tool / Function Calling, multi-step reasoning,
and automated storage diagnostics.
"""

import json
import os
import psutil
import requests

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "llama3.2"

# ==========================================
# 1. STORAGE SRE TOOL IMPLEMENTATIONS
# ==========================================

def calculate_raid_storage(disks: int, disk_size_tb: float, raid_level: str) -> str:
    """Calculates raw, usable capacity, parity overhead, and write penalty for RAID arrays."""
    lvl = str(raid_level).upper().replace("RAID", "").strip()
    
    if lvl == "0":
        usable = disks * disk_size_tb
        overhead = 0.0
        write_penalty = 1
    elif lvl == "1":
        usable = disk_size_tb
        overhead = (disks - 1) * disk_size_tb
        write_penalty = 2
    elif lvl == "5":
        if disks < 3:
            return "Error: RAID-5 requires at least 3 disks."
        usable = (disks - 1) * disk_size_tb
        overhead = disk_size_tb
        write_penalty = 4  # Read-Modify-Write (2 reads + 2 writes)
    elif lvl == "6":
        if disks < 4:
            return "Error: RAID-6 requires at least 4 disks."
        usable = (disks - 2) * disk_size_tb
        overhead = 2 * disk_size_tb
        write_penalty = 6  # Dual-parity Read-Modify-Write (3 reads + 3 writes)
    elif lvl == "10":
        if disks < 4 or disks % 2 != 0:
            return "Error: RAID-10 requires an even number of at least 4 disks."
        usable = (disks / 2) * disk_size_tb
        overhead = usable
        write_penalty = 2
    else:
        return f"Error: Unsupported RAID level '{raid_level}'."

    tib_usable = usable * (1000**4) / (1024**4)
    return json.dumps({
        "raid_level": f"RAID-{lvl}",
        "raw_capacity_tb": disks * disk_size_tb,
        "usable_capacity_tb": round(usable, 2),
        "usable_capacity_tib": round(tib_usable, 2),
        "parity_overhead_tb": round(overhead, 2),
        "random_write_penalty": f"{write_penalty}x IOPS penalty"
    })

def inspect_linux_io_scheduler(device_name: str) -> str:
    """Inspects and recommends optimal Linux block I/O schedulers based on storage media type."""
    dev = device_name.replace("/dev/", "").strip()
    
    # Read actual scheduler if on Linux, otherwise simulate standard hardware mapping
    sys_path = f"/sys/block/{dev}/queue/scheduler"
    if os.path.exists(sys_path):
        with open(sys_path, "r") as f:
            current = f.read().strip()
    else:
        # Realistic hardware baseline
        current = "[none] mq-deadline" if "nvme" in dev else "mq-deadline [bfq]"
    
    is_nvme = "nvme" in dev
    recommendation = "none (no-op)" if is_nvme else "mq-deadline (SATA SSD) or bfq (HDD)"
    rationale = (
        "For NVMe drives with multi-queue hardware submission, kernel scheduling adds CPU lock contention. "
        "Use 'none' to allow direct hardware queue submission. For rotating HDDs, use 'bfq' or 'mq-deadline' to merge adjacent sectors."
    )
    
    return json.dumps({
        "device": f"/dev/{dev}",
        "media_type": "NVMe PCIe SSD" if is_nvme else "SATA/SAS Block Device",
        "current_scheduler": current,
        "recommended_scheduler": recommendation,
        "engineering_rationale": rationale
    })

def parse_smart_telemetry(device_name: str) -> str:
    """Parses SMART health metrics (temperature, media wear, available spare, and error logs)."""
    dev = device_name.replace("/dev/", "").strip()
    
    # Simulates empirical enterprise SMART telemetry
    telemetry = {
        "device": f"/dev/{dev}",
        "temperature_celsius": 42,
        "critical_warning": "0x00 (Healthy)",
        "available_spare_percent": 98,
        "available_spare_threshold": 10,
        "percentage_used_wear": 4,
        "data_units_read_tb": 184.2,
        "data_units_written_tb": 212.8,
        "power_on_hours": 8420,
        "unsafe_shutdowns": 2,
        "media_errors": 0
    }
    return json.dumps(telemetry)

# Tool Dispatch Registry
TOOL_REGISTRY = {
    "calculate_raid_storage": calculate_raid_storage,
    "inspect_linux_io_scheduler": inspect_linux_io_scheduler,
    "parse_smart_telemetry": parse_smart_telemetry,
}

# ==========================================
# 2. OLLAMA TOOL SCHEMAS
# ==========================================

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "calculate_raid_storage",
            "description": "Calculate usable storage capacity, parity overhead, and write penalty for RAID arrays (RAID 0, 1, 5, 6, 10).",
            "parameters": {
                "type": "object",
                "properties": {
                    "disks": {"type": "integer", "description": "Number of drives in the storage array"},
                    "disk_size_tb": {"type": "number", "description": "Capacity of each disk in Terabytes"},
                    "raid_level": {"type": "string", "description": "RAID level: '0', '1', '5', '6', or '10'"}
                },
                "required": ["disks", "disk_size_tb", "raid_level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_linux_io_scheduler",
            "description": "Inspect and recommend Linux kernel block I/O schedulers (none, mq-deadline, bfq) for a specific device.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string", "description": "Block device name, e.g. '/dev/nvme0n1' or '/dev/sda'"}
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "parse_smart_telemetry",
            "description": "Retrieve SMART health indicators, wear leveling percentage, temperature, and error counters for a block device.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string", "description": "Block device name, e.g. '/dev/nvme0n1'"}
                },
                "required": ["device_name"]
            }
        }
    }
]

# ==========================================
# 3. AUTONOMOUS SRE AGENT COGNITIVE LOOP
# ==========================================

def run_storage_agent(user_prompt: str, max_steps: int = 6):
    print("\n" + "="*70)
    print(f"[*] STORAGE SRE GOAL: {user_prompt}")
    print("="*70)
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert Autonomous Storage Site Reliability Engineer (SRE). "
                "You have direct access to tools that calculate RAID capacity, inspect kernel I/O schedulers, "
                "and check SMART hardware health telemetry. "
                "Always invoke the appropriate tools to collect empirical facts before drawing conclusions. "
                "Explain the storage mechanics (e.g. Write Penalties, FTL Wear, multi-queue schedulers) in your final response."
            )
        },
        {"role": "user", "content": user_prompt}
    ]

    for step in range(1, max_steps + 1):
        print(f"\n--- [Iteration {step}] Agent Reasoning ---")
        
        payload = {
            "model": MODEL_NAME,
            "messages": messages,
            "tools": TOOLS_SCHEMA,
            "stream": False,
            "options": {"temperature": 0.0}
        }
        
        res = requests.post(OLLAMA_URL, json=payload).json()
        msg = res.get("message", {})
        messages.append(msg)
        
        tool_calls = msg.get("tool_calls")
        
        # If no tool calls were requested, the agent has reached its final answer
        if not tool_calls:
            print("\n[✓] Final Technical Solution:")
            print(msg.get("content", ""))
            return msg.get("content", "")
        
        # Execute each tool call
        for tc in tool_calls:
            func_name = tc["function"]["name"]
            func_args = tc["function"]["arguments"]
            
            print(f"[ACTION] Invoking Tool: {func_name}")
            print(f"         Arguments: {func_args}")
            
            fn = TOOL_REGISTRY.get(func_name)
            if not fn:
                out = f"Error: Tool '{func_name}' not implemented."
            else:
                try:
                    out = fn(**func_args)
                except Exception as ex:
                    out = f"Execution failed: {str(ex)}"
            
            print(f"[OBSERVATION] Result: {out[:140]}...")
            
            messages.append({
                "role": "tool",
                "content": str(out)
            })

    print("[!] Exceeded maximum iterations without resolution.")

# ==========================================
# EXECUTE STORAGE AGENT TESTS
# ==========================================
if __name__ == "__main__":
    # Test 1: RAID capacity and write penalty evaluation
    run_storage_agent("We need to configure eight 16TB drives in RAID-6. What is our usable capacity in TiB and what write penalty should our database expect?")

    # Test 2: Hardware health and kernel scheduler audit
    run_storage_agent("Audit the health and kernel I/O scheduler of /dev/nvme0n1.")
```

---

## 4. Running the Lab & Expected Output

Run the script:
```bash
python3 storage_agent.py
```

### Execution Trace:
```text
======================================================================
[*] STORAGE SRE GOAL: We need to configure eight 16TB drives in RAID-6. What is our usable capacity in TiB and what write penalty should our database expect?
======================================================================

--- [Iteration 1] Agent Reasoning ---
[ACTION] Invoking Tool: calculate_raid_storage
         Arguments: {'disks': 8, 'disk_size_tb': 16, 'raid_level': '6'}
[OBSERVATION] Result: {"raid_level": "RAID-6", "raw_capacity_tb": 128, "usable_capacity_tb": 96.0, "usable_capacity_tib": 87.31, "parity_overhead_tb": 32.0, "random_write_penalty": "6x IOPS penalty"}...

--- [Iteration 2] Agent Reasoning ---

[✓] Final Technical Solution:
For an array of eight 16TB drives configured in **RAID-6**:

1. **Storage Capacities**:
   - **Raw Total Capacity**: 128.0 TB
   - **Usable Storage Capacity**: 96.0 TB (approximately **87.31 TiB**)
   - **Parity Overhead**: 32.0 TB (equivalent to 2 dedicated parity drives, tolerating up to 2 simultaneous drive failures).

2. **Database Performance Implications (Write Penalty)**:
   - RAID-6 introduces a **6x Random Write Penalty**. 
   - Every small random 4KB write requires: 3 disk reads (old data + old parity P + old parity Q) followed by 3 disk writes (new data + new parity P + new parity Q).
   - If your database workload is write-intensive (such as OLTP with heavy WAL flushes), ensure you maintain high SSD queue depths or consider **RAID-10** (which has only a 2x write penalty) to avoid I/O bottlenecks.
```
