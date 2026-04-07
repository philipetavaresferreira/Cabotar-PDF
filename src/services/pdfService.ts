import { PDFDocument, rgb, PDFName, PDFArray, PDFRawStream, PDFRef, PDFDict } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import pako from 'pako';

// Configure pdfjs worker using the standard Vite way
// This ensures the worker is correctly bundled and matched with the library version
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
}

export interface ScanResult {
  headerHeight: number;
  footerHeight: number;
}

export async function scanForPurple(file: File): Promise<ScanResult> {
  // Ensure worker is set
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  // Scan first page
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!context) throw new Error('Could not get canvas context');
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  await page.render({ 
    canvasContext: context, 
    viewport
  }).promise;
  
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Purple detection: High R and B, Low G
  const isPurple = (r: number, g: number, b: number) => {
    return r > 60 && b > 60 && g < (r + b) / 2.5;
  };

  let headerHeight = 0;
  let footerHeight = 0;

  // Scan from top down for header
  // Optimization: Check every 2nd pixel and every 2nd row to speed up scan
  for (let y = 0; y < canvas.height / 3; y += 2) {
    let purpleInRow = false;
    for (let x = 0; x < canvas.width; x += 2) {
      const idx = (y * canvas.width + x) * 4;
      if (isPurple(data[idx], data[idx + 1], data[idx + 2])) {
        purpleInRow = true;
        break;
      }
    }
    if (purpleInRow) {
      headerHeight = y + 5;
    }
  }

  // Scan from bottom up for footer
  for (let y = canvas.height - 1; y > (canvas.height * 2) / 3; y -= 2) {
    let purpleInRow = false;
    for (let x = 0; x < canvas.width; x += 2) {
      const idx = (y * canvas.width + x) * 4;
      if (isPurple(data[idx], data[idx + 1], data[idx + 2])) {
        purpleInRow = true;
        break;
      }
    }
    if (purpleInRow) {
      footerHeight = (canvas.height - y) + 5;
    }
  }

  return { headerHeight, footerHeight };
}

export async function renderPageToCanvas(file: File, canvas: HTMLCanvasElement): Promise<void> {
  // Ensure worker is set
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  // Render page 7 if available, otherwise fallback to the last page
  const pageNumber = Math.min(7, pdf.numPages);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 }); // Higher scale for better preview
  
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get canvas context');
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  await page.render({ 
    canvasContext: context, 
    viewport
  }).promise;
}

export async function processPdf(
  file: File,
  headerHeight: number,
  footerHeight: number,
  applyColorShift: boolean = false,
  onProgress?: (stage: string, percent: number) => void
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.('Carregando documento...', 0);
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  let lastYieldTime = Date.now();

  // 1. Apply color shift in content streams and XObjects if requested
  if (applyColorShift) {
    const processedStreams = new Set<PDFRef>();

    const processStream = async (streamRef: PDFRef) => {
      if (processedStreams.has(streamRef)) return;
      processedStreams.add(streamRef);

      // Yield periodically to keep UI responsive
      if (Date.now() - lastYieldTime > 100) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYieldTime = Date.now();
      }

      const stream = pdfDoc.context.lookup(streamRef);
      if (stream instanceof PDFRawStream) {
        try {
          let streamData = stream.getContents();
          const filter = stream.dict.get(PDFName.of('Filter'));
          let isCompressed = false;
          
          // Handle single filter or array of filters
          const filters = filter instanceof PDFArray ? filter.asArray() : [filter];
          const hasFlate = filters.some(f => f === PDFName.of('FlateDecode'));

          if (hasFlate) {
            try {
              streamData = pako.inflate(streamData);
              isCompressed = true;
            } catch (e) {
              return;
            }
          } else if (filter) {
            return;
          }

          const contentStr = new TextDecoder('latin1').decode(streamData);
          
          // Early exit if no color operators found (case insensitive check for rg, RG, sc, SC, k, K)
          if (!/[rs]g|k/i.test(contentStr)) return;

          let newContentStr = contentStr.replace(
            /(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+(rg|RG|sc|SC)\b/gi,
            (match, r, g, b, op) => `${g} ${b} ${r} ${op}`
          );

          newContentStr = newContentStr.replace(
            /(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+(k|K|sc|SC)\b/gi,
            (match, c, m, y, k, op) => `${m} ${y} ${c} ${k} ${op}`
          );
          
          if (newContentStr === contentStr) return;

          let finalBytes = new Uint8Array(newContentStr.length);
          for (let j = 0; j < newContentStr.length; j++) {
            finalBytes[j] = newContentStr.charCodeAt(j);
          }

          if (isCompressed) {
            finalBytes = pako.deflate(finalBytes, { level: 1 });
          }

          const newStream = pdfDoc.context.stream(finalBytes);
          stream.dict.entries().forEach(([key, value]) => {
            if (key !== PDFName.of('Length')) {
              newStream.dict.set(key, value);
            }
          });
          
          pdfDoc.context.assign(streamRef, newStream);
        } catch (e) {
          console.warn('Could not process a stream', e);
        }
      }
    };

    for (let i = 0; i < totalPages; i++) {
      const page = pages[i];
      onProgress?.(`Analisando cores: página ${i + 1} de ${totalPages}...`, Math.round((i / totalPages) * 50));
      
      if (Date.now() - lastYieldTime > 100) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYieldTime = Date.now();
      }

      // Process main page contents
      const contents = page.node.get(PDFName.of('Contents'));
      if (contents) {
        const streamRefs = contents instanceof PDFArray ? contents.asArray() : [contents];
        for (const streamRef of streamRefs) {
          if (streamRef instanceof PDFRef) await processStream(streamRef);
        }
      }

      // Process XObjects (Forms)
      const resourcesRef = page.node.get(PDFName.of('Resources'));
      const resources = resourcesRef instanceof PDFRef ? pdfDoc.context.lookup(resourcesRef) : resourcesRef;
      
      if (resources instanceof PDFDict) {
        const xObjectsRef = resources.get(PDFName.of('XObject'));
        const xObjects = xObjectsRef instanceof PDFRef ? pdfDoc.context.lookup(xObjectsRef) : xObjectsRef;
        
        if (xObjects instanceof PDFDict) {
          const entries = xObjects.entries();
          for (const [name, ref] of entries) {
            if (ref instanceof PDFRef) {
              const xObj = pdfDoc.context.lookup(ref);
              if (xObj instanceof PDFRawStream && xObj.dict.get(PDFName.of('Subtype')) === PDFName.of('Form')) {
                await processStream(ref);
              }
            }
          }
        }
      }
    }
  }

  // 2. Draw white rectangles over header and footer
  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    onProgress?.(`Aplicando máscaras: página ${i + 1} de ${totalPages}...`, 50 + Math.round((i / totalPages) * 45));
    
    if (Date.now() - lastYieldTime > 100) {
      await new Promise(resolve => setTimeout(resolve, 0));
      lastYieldTime = Date.now();
    }
    
    const { width, height } = page.getSize();

    // If it's the first page, blank it completely
    if (i === 0) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: rgb(1, 1, 1),
      });
      continue;
    }

    if (headerHeight > 0) {
      page.drawRectangle({
        x: 0,
        y: height - headerHeight,
        width,
        height: headerHeight,
        color: rgb(1, 1, 1),
      });
    }

    if (footerHeight > 0) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height: footerHeight,
        color: rgb(1, 1, 1),
      });
    }
  }

  // Final yield before heavy save operation
  onProgress?.('Finalizando e salvando PDF...', 95);
  await new Promise(resolve => setTimeout(resolve, 0));
  return await pdfDoc.save();
}
