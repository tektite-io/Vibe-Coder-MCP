# Job Result Retriever Tool (`get-job-result`)

## Overview

This tool retrieves the final result of an asynchronous background job that was previously initiated by another tool (like `generate-task-list`, `run-workflow`, etc.).

## Inputs

| Parameter | Type     | Description                                  | Required |
| :-------- | :------- | :------------------------------------------- | :------- |
| `jobId`   | `string` | The unique ID of the job whose result is needed. | Yes      |

### Example Input JSON

```json
{
  "jobId": "some-unique-job-identifier-123"
}
```

## Outputs

*   **Primary Output:** The `CallToolResult` object that was stored by the background job upon its completion or failure. This could contain the final generated content (e.g., task list, code snippet) or error details.
*   **File Storage:** This tool does not save any files itself; it retrieves results potentially saved by other tools.

## Output Schema

 
The tool returns a standard `CallToolResult` object. The `content` field within this result will be an array, typically containing a single text element. The text describes the job's current status or provides its final result.

The structure of the `text` content varies based on the job's state:
*   **Job PENDING**: Indicates the job is queued.
  * Example `text`: `Job 'some-unique-job-identifier-123' is pending.`
*   **Job RUNNING**: Indicates the job is actively processing.
  * Example `text`: `Job 'some-unique-job-identifier-123' is running.`
*   **Job COMPLETED Successfully**:
  * If the job produced a structured result, it's often stringified within the `text`.
    Example `text`: `Job 'some-unique-job-identifier-123' completed successfully. Result: { "output": "This is the detailed job output" }`
  * If the job completed with no specific additional output beyond success.
    Example `text`: `Job 'some-unique-job-identifier-123' completed successfully. No additional result output.`
*   **Job FAILED**: Indicates an error occurred during job execution. The `text` will contain details about the failure.
  * Example `text`: `Job 'some-unique-job-identifier-123' failed. Error: An error message detailing the failure.`
*   **Job ID Not Found**: If the provided `jobId` does not correspond to any known job.
  * Example `text`: `Job with ID 'invalid-job-id' not found.`

### Example Output JSON (for a COMPLETED job with a structured result)

```json
{
  "content": [
    {
      "type": "text",
      "text": "Job 'some-unique-job-identifier-123' completed successfully. Result: { \"data\": \"final output\" }"
    }
  ],
  "isError": false
}
```

*(Note: The `isError` flag in the outer `CallToolResult` will be `false` if the `get-job-result` tool itself executed successfully in retrieving the status. The success or failure of the *underlying* job is conveyed within the `text` content.)*

### Example Output JSON (for a RUNNING job)

```json
{
  "content": [
    {
      "type": "text",
      "text": "Job 'some-unique-job-identifier-123' is running."
    }
  ],
  "isError": false
}
```

### Example Output JSON (for a FAILED job reported by `get-job-result`)

```json
{
  "content": [
    {
      "type": "text",
      "text": "Job 'some-unique-job-identifier-123' failed. Error: Something went wrong during execution."
    }
  ],
  "isError": false 
}
```

*(The `get-job-result` tool itself succeeded; it's reporting the status of the job which failed).*

## Workflow

```mermaid
flowchart TD
    A[Start get-job-result] --> B{Validate Input Schema};
    B --> |Invalid| Z[Return Error: Invalid Job ID Format];
    B --> |Valid| C[Get JobManager Instance];
    C --> D[Call jobManager.getJob(jobId)];
    D --> E{Job Found?};
    E --> |No| F[Return Error: Job Not Found];
    E --> |Yes| G{Job Status?};
    G -- PENDING/RUNNING --> H[Return Info: Job Still Processing];
    G -- COMPLETED/FAILED --> I[Return Stored Job Result (Success or Error)];
    F --> X[End];
    H --> X;
    I --> X;
    Z --> X;
```

1.  **Validate Input:** The `jobId` parameter is validated.
2.  **Get Job Manager:** Retrieves the singleton instance of the `JobManager` service.
3.  **Retrieve Job:** Calls `jobManager.getJob(jobId)` to fetch the job's state.
4.  **Check Status:**
    *   If the job is not found, returns an error.
    *   If the job status is `PENDING` or `RUNNING`, returns an informational message indicating the job is still in progress.
    *   If the job status is `COMPLETED` or `FAILED`, retrieves the stored `result` (which is a `CallToolResult` object) from the job record.
5.  **Return Result:** Returns the stored `CallToolResult` from the completed/failed job.

## Usage Example

```json
{
  "tool_name": "get-job-result",
  "arguments": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000" 
  }
}
```

Invoked via AI Assistant (after getting a Job ID from another tool):
`"Get the result for job ID 123e4567-e89b-12d3-a456-426614174000"`

### Conceptual Client-Side JavaScript Example

A client application would typically call this tool periodically after initiating a long-running operation that returned a `jobId`.

```javascript
// Conceptual client-side JavaScript
async function checkJobStatus(mcpClient, jobId) {
  try {
    const result = await mcpClient.callTool('get-job-result', { jobId });
    if (result.isError) {
      console.error("Error calling get-job-result tool:", result.content[0]?.text || "Unknown error");
    } else {
      console.log("Job Status/Result:", result.content[0]?.text);
      // Further processing based on the text content.
      // For example, parse the result if the job completed successfully.
      const textContent = result.content[0]?.text || "";
      if (textContent.includes("completed successfully. Result:")) {
        // Attempt to parse the result part
        try {
          const resultJsonString = textContent.substring(textContent.indexOf("Result:") + "Result:".length).trim();
          const jobOutput = JSON.parse(resultJsonString);
          console.log("Parsed Job Output:", jobOutput);
        } catch (parseError) {
          console.warn("Could not parse job output from text:", parseError);
        }
      }
    }
  } catch (error) {
    console.error("Exception while calling get-job-result:", error);
  }
}

// Example usage:
// const myJobId = "some-unique-job-identifier-123";
// // Periodically check status, e.g., using setInterval or a polling mechanism
// // setInterval(() => checkJobStatus(myMcpClientInstance, myJobId), 5000); 
```

## Error Handling

*   **Input Validation Errors:** Returns an error if `jobId` is missing or not a string.
*   **Job Not Found:** Returns an error if no job exists with the provided `jobId`.
*   **Job Still Processing:** Returns an informational message (not strictly an error) if the job is still `PENDING` or `RUNNING`.
