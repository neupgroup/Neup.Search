
import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@neup/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@neup/components/ui/table"
import { Badge } from "@neup/components/ui/badge"
import { getErrors, type SystemError } from "./actions"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@neup/components/ui/accordion"


function PageContent() {
    return (
        <Suspense fallback={<div>Loading errors...</div>}>
            <ErrorsList />
        </Suspense>
    )
}

async function ErrorsList() {
    const errors = await getErrors();

    return (
        <Card>
            <CardHeader>
                <CardTitle>System Errors</CardTitle>
                <CardDescription>
                A log of all errors that have occurred in the application.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[20%]">Timestamp</TableHead>
                    <TableHead className="w-[20%]">Context</TableHead>
                    <TableHead>Message & Stack Trace</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {errors.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={3} className="h-24 text-center">
                                No errors have been logged. Great!
                            </TableCell>
                        </TableRow>
                    )}
                    {errors.map((error) => (
                    <TableRow key={error.id} className="items-start">
                        <TableCell className="font-medium align-top">
                           {error.createdAt.toLocaleString()}
                        </TableCell>
                        <TableCell className="align-top">
                            <Badge variant="destructive">{error.context}</Badge>
                        </TableCell>
                        <TableCell>
                             <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="item-1">
                                    <AccordionTrigger className="p-0 hover:no-underline">
                                        <p className="line-clamp-2 font-mono text-xs">{error.message}</p>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <pre className="mt-4 text-xs bg-muted p-4 rounded-md overflow-x-auto">
                                            {error.stack}
                                        </pre>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}


export default async function ManageErrorsPage() {
  return (
    <PageContent />
  )
}
