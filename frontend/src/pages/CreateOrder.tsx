import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { productService, orderService, extractOrderId } from '../services/api';
import { Product } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface OrderItemInput {
  productId: string;
  quantity: number;
  price: number;
  productName: string; // Pour l'affichage uniquement
}

const CreateOrder: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItemInput[]>([]);
  const [notes, setNotes] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const navigate = useNavigate();

  // Charger les produits au chargement de la page
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const productsData = await productService.getProducts();
        setProducts(productsData);
        setLoading(false);
      } catch (error) {
        console.error('Erreur lors du chargement des produits:', error);
        toast.error('Impossible de charger les produits. Veuillez réessayer.');
        setLoading(false);
      }
    };

    fetchProducts();
  }, [toast]);

  // Ajouter un produit à la commande
  const handleAddProduct = () => {
    if (!selectedProduct || quantity <= 0) {
      toast.error('Veuillez sélectionner un produit et une quantité valide.');
      return;
    }

    const product = products.find(p => p.id === selectedProduct);
    if (!product) {
      toast.error('Produit non trouvé.');
      return;
    }

    // Vérifier si le produit est déjà dans la commande
    const existingItemIndex = orderItems.findIndex(item => item.productId === selectedProduct);
    
    if (existingItemIndex >= 0) {
      // Mettre à jour la quantité si le produit existe déjà
      const updatedItems = [...orderItems];
      updatedItems[existingItemIndex].quantity += quantity;
      setOrderItems(updatedItems);
    } else {
      // Ajouter un nouveau produit
      setOrderItems([
        ...orderItems,
        {
          productId: product.id,
          productName: product.name,
          quantity,
          price: product.price
        }
      ]);
    }

    // Réinitialiser les champs
    setSelectedProduct('');
    setQuantity(1);
  };

  // Supprimer un produit de la commande
  const handleRemoveProduct = (index: number) => {
    const updatedItems = [...orderItems];
    updatedItems.splice(index, 1);
    setOrderItems(updatedItems);
  };

  // Calculer le total de la commande
  const calculateTotal = () => {
    return orderItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  // Soumettre la commande
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (orderItems.length === 0) {
      toast.error('Veuillez ajouter au moins un produit à la commande.');
      return;
    }

    setSubmitting(true);

    try {
      // Préparer les données de la commande
      const orderData = {
        items: orderItems.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        })),
        notes: notes || undefined
      };

      // Envoyer la commande
      const result = await orderService.createOrder(orderData);
      
      toast.success('Commande créée avec succès!');
      
      // Extraire l'ID de la commande de la réponse
      const orderId = extractOrderId(result);
      
      if (!orderId) {
        console.error('Impossible de trouver l\'ID de la commande dans la réponse:', result);
        toast.error('Erreur lors de la redirection vers les détails de la commande');
        return;
      }
      
      console.log('Redirection vers la commande avec ID:', orderId);
      
      // Vérifier que la commande existe avant de rediriger
      try {
        // Attendre un court instant pour s'assurer que la commande est bien enregistrée
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Tenter de récupérer la commande
        await orderService.getOrderById(orderId);
        
        // Si la commande existe, rediriger vers la page de détails
        navigate(`/orders/${orderId}`);
      } catch (redirectError) {
        console.error('Erreur lors de la vérification de la commande:', redirectError);
        toast.error('La commande a été créée mais impossible d\'accéder aux détails pour le moment');
      }
    } catch (error) {
      console.error('Erreur lors de la création de la commande:', error);
      
      // L'erreur est déjà gérée par le service API qui affiche un toast
      // Nous n'avons pas besoin d'afficher un autre toast ici
      
      // Vérifier si nous devons rafraîchir les données des produits
      if (error.response?.data?.message?.includes('Stock insuffisant')) {
        // Rafraîchir les données des produits pour afficher les stocks à jour
        try {
          const productsData = await productService.getProducts();
          setProducts(productsData);
        } catch (refreshError) {
          console.error('Erreur lors du rafraîchissement des produits:', refreshError);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Chargement des produits...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Créer une nouvelle commande</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formulaire de sélection de produits */}
        <Card>
          <CardHeader>
            <CardTitle>Ajouter des produits</CardTitle>
            <CardDescription>Sélectionnez les produits à ajouter à la commande</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product">Produit</Label>
                <Select
                  value={selectedProduct}
                  onValueChange={setSelectedProduct}
                >
                  <SelectTrigger id="product">
                    <SelectValue placeholder="Sélectionner un produit" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {product.price.toFixed(2)}€ ({product.stock} en stock)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantité</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              
              <Button 
                type="button" 
                onClick={handleAddProduct}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" /> Ajouter à la commande
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Récapitulatif de la commande */}
        <Card>
          <CardHeader>
            <CardTitle>Récapitulatif de la commande</CardTitle>
            <CardDescription>Produits sélectionnés pour cette commande</CardDescription>
          </CardHeader>
          <CardContent>
            {orderItems.length === 0 ? (
              <p className="text-muted-foreground">Aucun produit ajouté à la commande</p>
            ) : (
              <div className="space-y-4">
                {orderItems.map((item, index) => (
                  <div key={index} className="flex justify-between items-center border-b pb-2">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity} x {item.price.toFixed(2)}€
                      </p>
                    </div>
                    <div className="flex items-center">
                      <p className="font-medium mr-4">
                        {(item.quantity * item.price).toFixed(2)}€
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveProduct(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <div className="flex justify-between items-center pt-2 font-bold">
                  <span>Total</span>
                  <span>{calculateTotal().toFixed(2)}€</span>
                </div>
              </div>
            )}
            
            <div className="mt-6 space-y-2">
              <Label htmlFor="notes">Notes (optionnel)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ajouter des notes pour cette commande"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleSubmit} 
              disabled={orderItems.length === 0 || submitting}
              className="w-full"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer la commande
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default CreateOrder; 