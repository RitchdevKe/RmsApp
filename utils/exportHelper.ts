import { getTodayIsoDate } from './timezone';

/**
 * Exports an array of objects to a CSV file.
 * @param data Array of data objects
 * @param filename Name of the file without extension
 */
export const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
        alert("No data available to export.");
        return;
    }

    // Extract headers from the first object
    const headers = Object.keys(data[0]);

    // Construct CSV rows
    const csvRows = [
        headers.join(','), // Header row
        ...data.map(row => 
            headers.map(fieldName => {
                let val = row[fieldName];
                // Handle null/undefined
                if (val === null || val === undefined) val = '';
                // Convert to string and escape double quotes
                const stringVal = String(val).replace(/"/g, '""');
                // Wrap in double quotes to handle commas and newlines in data
                return `"${stringVal}"`;
            }).join(',')
        )
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${getTodayIsoDate()}.csv`);
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Prints a specific section of the page by ID, or the whole page if no ID provided.
 * Preserves Tailwind styles by injecting the CDN link.
 * @param elementId Optional ID of the element to print
 * @param title Optional title for the print document
 */
export const printSection = (elementId?: string, title: string = 'Print Document') => {
    if (!elementId) {
        window.print();
        return;
    }

    const content = document.getElementById(elementId);
    if (!content) {
        console.warn(`Element with ID ${elementId} not found. Printing full page.`);
        window.print();
        return;
    }

    const printWindow = window.open('', '', 'height=800,width=1000');
    if (printWindow) {
        printWindow.document.write('<html><head><title>' + title + '</title>');
        
        // Inject Tailwind for styling
        printWindow.document.write('<script src="https://cdn.tailwindcss.com"></script>');
        
        // Add custom print styles
        printWindow.document.write(`
            <style>
                body { font-family: 'Inter', sans-serif; padding: 20px; -webkit-print-color-adjust: exact; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        `);
        
        printWindow.document.write('</head><body>');
        printWindow.document.write(content.innerHTML);
        printWindow.document.write('</body></html>');
        
        printWindow.document.close();
        printWindow.focus();

        // Wait for scripts/styles to load before printing
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 1000);
    }
};
