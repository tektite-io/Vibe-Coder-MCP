import { z } from 'zod';
declare const fileStructureItemSchema: z.ZodTypeAny;
export { fileStructureItemSchema };
export declare const starterKitDefinitionSchema: z.ZodObject<{
    projectName: z.ZodString;
    description: z.ZodString;
    techStack: z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
        rationale: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        rationale: string;
        version?: string | undefined;
    }, {
        name: string;
        rationale: string;
        version?: string | undefined;
    }>>;
    directoryStructure: z.ZodArray<z.ZodTypeAny, "many">;
    dependencies: z.ZodObject<{
        npm: z.ZodOptional<z.ZodObject<{
            root: z.ZodOptional<z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }>>;
        }, "strip", z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }>, z.objectOutputType<{
            root: z.ZodOptional<z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }>>;
        }, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }>, "strip">, z.objectInputType<{
            root: z.ZodOptional<z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }>>;
        }, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }>, "strip">>>;
    }, "strip", z.ZodTypeAny, {
        npm?: z.objectOutputType<{
            root: z.ZodOptional<z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }>>;
        }, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }>, "strip"> | undefined;
    }, {
        npm?: z.objectInputType<{
            root: z.ZodOptional<z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }>>;
        }, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }>, "strip"> | undefined;
    }>;
    setupCommands: z.ZodArray<z.ZodString, "many">;
    nextSteps: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    dependencies: {
        npm?: z.objectOutputType<{
            root: z.ZodOptional<z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }>>;
        }, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }>, "strip"> | undefined;
    };
    projectName: string;
    techStack: Record<string, {
        name: string;
        rationale: string;
        version?: string | undefined;
    }>;
    directoryStructure: any[];
    setupCommands: string[];
    nextSteps: string[];
}, {
    description: string;
    dependencies: {
        npm?: z.objectInputType<{
            root: z.ZodOptional<z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }, {
                dependencies?: Record<string, string> | undefined;
                devDependencies?: Record<string, string> | undefined;
            }>>;
        }, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }, {
            dependencies?: Record<string, string> | undefined;
            devDependencies?: Record<string, string> | undefined;
        }>, "strip"> | undefined;
    };
    projectName: string;
    techStack: Record<string, {
        name: string;
        rationale: string;
        version?: string | undefined;
    }>;
    directoryStructure: any[];
    setupCommands: string[];
    nextSteps: string[];
}>;
export type StarterKitDefinition = z.infer<typeof starterKitDefinitionSchema>;
