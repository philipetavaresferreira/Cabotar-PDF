import React, { useState, useRef, useEffect } from 'react';
import { FileUp, Download, Trash2, Loader2, ShieldCheck, Info, FileText, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { scanForPurple, processPdf, renderPageToCanvas, type ScanResult } from './services/pdfService';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [isPurified, setIsPurified] = useState(false);
  const [processedBlobUrl, setProcessedBlobUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [headerHeight, setHeaderHeight] = useState(60);
  const [footerHeight, setFooterHeight] = useState(60);
  const [applyColorShift, setApplyColorShift] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setIsScanning(true);
      setIsPurified(false);
      if (processedBlobUrl) {
        URL.revokeObjectURL(processedBlobUrl);
        setProcessedBlobUrl(null);
      }
      try {
        const result = await scanForPurple(selectedFile);
        setScanResult(result);
      } catch (error) {
        console.error('Error scanning PDF:', error);
      } finally {
        setIsScanning(false);
      }
    }
  };

  useEffect(() => {
    if (file && previewCanvasRef.current && !isScanning) {
      renderPageToCanvas(file, previewCanvasRef.current).catch(console.error);
    }
  }, [file, isScanning]);

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProcessingStage('Iniciando...');
    setProcessingPercent(0);
    try {
      const processedBytes = await processPdf(
        file, 
        headerHeight, 
        footerHeight, 
        applyColorShift,
        (stage, percent) => {
          setProcessingStage(stage);
          setProcessingPercent(percent);
        }
      );
      const blob = new Blob([processedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setProcessedBlobUrl(url);
      setIsPurified(true);
    } catch (error) {
      console.error('Error processing PDF:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedBlobUrl || !file) return;
    const link = document.createElement('a');
    link.href = processedBlobUrl;
    link.download = `purificado_${file.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setFile(null);
    setScanResult(null);
    setHeaderHeight(60);
    setFooterHeight(60);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (processedBlobUrl) URL.revokeObjectURL(processedBlobUrl);
    setProcessedBlobUrl(null);
    setIsPurified(false);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans selection:bg-purple-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-purple-200">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Purificador de PDFs</h1>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Limpeza Inteligente de Documentos</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm font-medium text-gray-500 hover:text-purple-600 transition-colors"
          >
            Documentação
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Controls */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <FileUp size={16} /> Upload do Arquivo
              </h2>
              
              {!file ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all group"
                >
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 group-hover:scale-110 group-hover:bg-purple-100 group-hover:text-purple-600 transition-all">
                    <FileUp size={32} />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-gray-900">Clique para selecionar</p>
                    <p className="text-sm text-gray-500">ou arraste seu PDF aqui</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".pdf" 
                    className="hidden" 
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between border border-gray-100">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 shrink-0">
                        <FileText size={20} />
                      </div>
                      <div className="truncate">
                        <p className="font-medium text-sm text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button 
                      onClick={reset}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}
            </section>

            <AnimatePresence>
              {file && (
                <motion.section 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6"
                >
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 size={16} /> Configurações de Máscara
                  </h2>

                  {isScanning ? (
                    <div className="flex flex-col items-center py-8 gap-3">
                      <Loader2 className="animate-spin text-purple-600" size={32} />
                      <p className="text-sm text-gray-500 animate-pulse">Analisando elementos visuais...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-medium text-gray-700">Cabeçalho (px)</label>
                          <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">{headerHeight}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="300" 
                          value={headerHeight} 
                          onChange={(e) => setHeaderHeight(parseInt(e.target.value))}
                          className="w-full accent-purple-600"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-medium text-gray-700">Rodapé (px)</label>
                          <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">{footerHeight}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="300" 
                          value={footerHeight} 
                          onChange={(e) => setFooterHeight(parseInt(e.target.value))}
                          className="w-full accent-purple-600"
                        />
                      </div>

                      <div className="pt-4 border-t border-gray-100">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className="relative">
                            <input 
                              type="checkbox" 
                              checked={applyColorShift}
                              onChange={(e) => setApplyColorShift(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                          </div>
                          <span className="text-sm font-medium text-gray-700 group-hover:text-purple-600 transition-colors">
                            Aplicar Color Shift (Mudar Todas as Cores)
                          </span>
                        </label>
                        <p className="text-[10px] text-gray-400 mt-2 ml-14">
                          Ative para aplicar uma rotação de canais de cor em todo o documento. Útil para neutralizar cores específicas sem afetar o preto.
                        </p>
                      </div>

                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                        <Info className="text-blue-500 shrink-0" size={18} />
                        <p className="text-xs text-blue-700 leading-relaxed">
                          As máscaras estão fixadas em 60px conforme solicitado. A primeira página do documento será transformada em uma página em branco.
                        </p>
                      </div>

                      <div className="flex flex-col gap-3">
                        {!isPurified ? (
                          <button
                            type="button"
                            onClick={handleProcess}
                            disabled={isProcessing}
                            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2"
                          >
                            {isProcessing ? (
                              <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2">
                                  <Loader2 className="animate-spin" size={20} />
                                  <span className="font-semibold">Purificando...</span>
                                </div>
                                <div className="w-full bg-purple-200 rounded-full h-1.5 mt-1">
                                  <div 
                                    className="bg-white h-1.5 rounded-full transition-all duration-300" 
                                    style={{ width: `${processingPercent}%` }}
                                  />
                                </div>
                                <p className="text-[10px] opacity-80">{processingStage}</p>
                              </div>
                            ) : (
                              <>
                                <ShieldCheck size={20} />
                                Purificar Documento
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-3 text-green-700">
                              <ShieldCheck size={20} className="shrink-0" />
                              <p className="text-xs font-medium">Documento purificado com sucesso!</p>
                            </div>
                            <button
                              type="button"
                              onClick={handleDownload}
                              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2"
                            >
                              <Download size={20} />
                              Baixar PDF Purificado
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsPurified(false)}
                              className="w-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2 px-6 rounded-xl transition-all text-xs"
                            >
                              Ajustar e Purificar Novamente
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.section>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Preview */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm h-full min-h-[600px] flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h2 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  Visualização do Documento (Página 7)
                </h2>
                {file && (
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 relative bg-gray-200/50 overflow-auto p-8 flex justify-center">
                {file ? (
                  <div className="relative shadow-2xl">
                    <canvas 
                      ref={previewCanvasRef}
                      className="max-w-full h-auto bg-white rounded-sm shadow-inner"
                      style={{ width: '600px' }}
                    />
                    
                    {/* Visual Overlays to show where the mask will be */}
                    {/* We need to calculate the overlay position based on the canvas height */}
                    <div 
                      className="absolute top-0 left-0 w-full bg-purple-500/30 border-b border-purple-500 pointer-events-none transition-all"
                      style={{ height: `${(headerHeight * 1.5 / 1.5)}px` }} // Approximate scaling
                    >
                      <div className="absolute bottom-0 right-2 text-[10px] font-bold text-purple-700 uppercase">Máscara Cabeçalho</div>
                    </div>
                    
                    <div 
                      className="absolute bottom-0 left-0 w-full bg-purple-500/30 border-t border-purple-500 pointer-events-none transition-all"
                      style={{ height: `${(footerHeight * 1.5 / 1.5)}px` }} // Approximate scaling
                    >
                      <div className="absolute top-0 right-2 text-[10px] font-bold text-purple-700 uppercase">Máscara Rodapé</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                      <FileText size={40} />
                    </div>
                    <p className="text-sm font-medium">Nenhum arquivo para visualizar</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-gray-200 mt-12 flex flex-col md:flex-row items-center justify-between gap-4 text-gray-500 text-sm">
        <p>© 2026 Purificador de PDFs. Todos os direitos reservados.</p>
        <div className="flex items-center gap-6">
          <p className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Processamento Local Seguro
          </p>
        </div>
      </footer>
    </div>
  );
}
